//! D1 邮件状态存储：确认、退订和至多一次自动尝试的投递队列。
//! D1 mail state: confirmation, opt-out, and a delivery queue with no automatic retry after ambiguous sends.

use serde::Deserialize;
use worker::{d1::D1Database, Result};

/// 邮件用户的退订凭据；令牌是秘密，不得记录日志。
/// Subscriber opt-out credential; the token is secret and must never be logged.
#[derive(Clone, Debug, Deserialize)]
pub struct Subscriber {
    pub unsubscribe_token: String,
}

/// 订阅请求结果；已有待确认用户不应重复发送确认邮件。
/// Subscription result; an existing pending user should not receive another confirmation message.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SubscribeOutcome {
    PendingCreated,
    PendingExisting,
    AlreadyConfirmed,
    AlreadyUnsubscribed,
}

/// CI 编辑活动的结果；已入队内容不可隐式变更。
/// CI campaign-edit result; queued content cannot be changed implicitly.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CampaignWrite {
    Created,
    Updated,
    AlreadyQueued,
    Conflict,
}

/// 管理端的活动与投递计数；`unknown` 需要人工核对。
/// Campaign and delivery counts for operators; `unknown` requires manual reconciliation.
#[derive(Clone, Debug, Deserialize)]
pub struct CampaignStatus {
    pub id: String,
    pub status: String,
    pub pending: i64,
    pub sending: i64,
    pub sent: i64,
    pub failed: i64,
    pub unknown: i64,
    pub skipped: i64,
}

/// 已取得独占租约的投递任务。租约过期后不再自动重试，因为服务商可能已接收邮件。
/// Exclusively leased delivery. An expired lease is never retried automatically because the provider may have accepted the mail.
#[derive(Clone, Debug)]
pub struct Delivery {
    pub campaign_id: String,
    pub email: String,
    pub subject: String,
    pub html: String,
    pub attempts: i64,
    pub lease_expires_at: i64,
}

/// D1 存储门面；所有调用都使用预处理语句和绑定参数。
/// D1 store facade; every call uses prepared statements and bound parameters.
pub struct Store {
    db: D1Database,
}

#[derive(Deserialize)]
struct Campaign {
    subject: String,
    html: String,
    status: String,
}

#[derive(Deserialize)]
struct Claimed {
    campaign_id: String,
    email: String,
    attempts: i64,
    lease_expires_at: i64,
}

#[derive(Deserialize)]
struct DeliveryContent {
    subject: String,
    html: String,
}

impl Store {
    /// 使用 Workers 环境绑定构造门面。 / Construct from a Workers environment binding.
    pub fn new(db: D1Database) -> Self {
        Self { db }
    }

    /// 新增待确认订阅；过期记录或主动退订者可重新请求，但绝不直接确认。
    /// Create a pending subscription; an expired record or opted-out user may request again, but is never confirmed directly.
    ///
    /// `email` 应预先规范化，`token_hash` 是确认令牌的哈希，时间单位为 Unix 毫秒。
    /// `email` must be normalized, `token_hash` hashes the confirmation token, and times use Unix milliseconds.
    pub async fn subscribe_pending(
        &self,
        email: &str,
        locale: &str,
        token_hash: &str,
        expires_at: i64,
        unsubscribe_token: &str,
        now: i64,
    ) -> Result<SubscribeOutcome> {
        let changed: Option<String> = worker::query!(
            &self.db,
            "INSERT INTO subscribers(email,locale,status,confirm_token_hash,confirm_expires_at,unsubscribe_token,created_at,updated_at) \
             VALUES (?1,?2,'pending',?3,?4,?5,?6,?6) \
             ON CONFLICT(email) DO UPDATE SET locale=excluded.locale,status='pending', \
               confirm_token_hash=excluded.confirm_token_hash,confirm_expires_at=excluded.confirm_expires_at, \
               unsubscribe_token=excluded.unsubscribe_token,updated_at=excluded.updated_at \
             WHERE subscribers.status='unsubscribed' OR \
               (subscribers.status='pending' AND subscribers.confirm_expires_at < ?6) \
             RETURNING email",
            email,
            locale,
            token_hash,
            expires_at,
            unsubscribe_token,
            now
        )?
        .first(Some("email"))
        .await?;
        if changed.is_some() {
            return Ok(SubscribeOutcome::PendingCreated);
        }
        let status: Option<String> = worker::query!(
            &self.db,
            "SELECT status FROM subscribers WHERE email=?1",
            email
        )?
        .first(Some("status"))
        .await?;
        Ok(match status.as_deref() {
            Some("confirmed") => SubscribeOutcome::AlreadyConfirmed,
            Some("unsubscribed") => SubscribeOutcome::AlreadyUnsubscribed,
            _ => SubscribeOutcome::PendingExisting,
        })
    }

    /// 只读查找有效确认令牌；GET 路由可调用此方法但不得改变状态。
    /// Read-only lookup of a live confirmation token; a GET route may use this without mutating state.
    pub async fn get_pending_by_token_hash(
        &self,
        hash: &str,
        now: i64,
    ) -> Result<Option<Subscriber>> {
        worker::query!(
            &self.db,
            "SELECT unsubscribe_token FROM subscribers \
             WHERE status='pending' AND confirm_token_hash=?1 AND confirm_expires_at>=?2",
            hash,
            now
        )?
        .first(None)
        .await
    }

    /// 确认邮件明确发送失败时使当前待确认令牌过期，以允许用户立即重试。
    /// Expire the current pending token after an explicit confirmation-send failure so the user may retry immediately.
    ///
    /// 仅匹配该令牌；若并发请求已换发新令牌，不会撤销新请求。仍保留非空到期时间以满足表约束。
    /// Match only this token; a concurrently renewed token is unaffected. Keep a non-null expiry to satisfy the table invariant.
    pub async fn expire_pending(&self, token_hash: &str, now: i64) -> Result<()> {
        worker::query!(
            &self.db,
            "UPDATE subscribers SET confirm_expires_at=?2-1,updated_at=?2 \
             WHERE status='pending' AND confirm_token_hash=?1",
            token_hash,
            now
        )?
        .run()
        .await?;
        Ok(())
    }

    /// POST 确认订阅；使用原子 UPDATE 消耗令牌。
    /// Confirm by POST; an atomic UPDATE consumes the token.
    pub async fn confirm(&self, hash: &str, now: i64) -> Result<Option<Subscriber>> {
        worker::query!(
            &self.db,
            "UPDATE subscribers SET status='confirmed',confirm_token_hash=NULL,confirm_expires_at=NULL,updated_at=?2 \
             WHERE status='pending' AND confirm_token_hash=?1 AND confirm_expires_at>=?2 \
             RETURNING unsubscribe_token",
            hash,
            now
        )?
        .first(None)
        .await
    }

    /// POST 退订；原始不透明令牌仅用于此查询，不记录、不回显。
    /// Opt out by POST; the raw opaque token is used only for this lookup, never logged or echoed.
    ///
    /// 为了使链接可直接使用，数据库保存原始退订令牌而非哈希；泄露数据库会允许退订，
    /// 但不能冒用订阅者发送邮件。 / To support direct links, the database stores the raw
    /// token rather than a hash; a DB leak permits opt-out but not sending mail as the user.
    pub async fn unsubscribe(&self, token: &str, now: i64) -> Result<bool> {
        let email: Option<String> = worker::query!(
            &self.db,
            "UPDATE subscribers SET status='unsubscribed',confirm_token_hash=NULL,confirm_expires_at=NULL,updated_at=?2 \
             WHERE unsubscribe_token=?1 AND status<>'unsubscribed' RETURNING email",
            token,
            now
        )?
        .first(Some("email"))
        .await?;
        if let Some(email) = email {
            worker::query!(
                &self.db,
                "UPDATE deliveries SET status='skipped',lease_expires_at=NULL \
                 WHERE email=?1 AND status IN ('pending','failed')",
                email
            )?
            .run()
            .await?;
            return Ok(true);
        }
        Ok(false)
    }

    /// 最后一次发送前核实同意状态，避免退订后发送未开始的邮件。
    /// Recheck consent immediately before sending so queued mail is not sent after opt-out.
    pub async fn get_confirmed_by_email(&self, email: &str) -> Result<Option<Subscriber>> {
        worker::query!(
            &self.db,
            "SELECT unsubscribe_token FROM subscribers WHERE email=?1 AND status='confirmed'",
            email
        )?
        .first(None)
        .await
    }

    /// 用稳定 ID 新建或编辑草稿；重复提交已入队的相同内容安全无副作用。
    /// Create or edit a draft by stable ID; repeating identical queued content is a no-op.
    pub async fn upsert_draft(
        &self,
        id: &str,
        subject: &str,
        html: &str,
        now: i64,
    ) -> Result<CampaignWrite> {
        let inserted: Option<String> = worker::query!(
            &self.db,
            "INSERT INTO campaigns(id,subject,html,status,created_at,updated_at) \
             VALUES (?1,?2,?3,'draft',?4,?4) ON CONFLICT(id) DO NOTHING RETURNING id",
            id,
            subject,
            html,
            now
        )?
        .first(Some("id"))
        .await?;
        if inserted.is_some() {
            return Ok(CampaignWrite::Created);
        }
        let current: Option<Campaign> = worker::query!(
            &self.db,
            "SELECT subject,html,status FROM campaigns WHERE id=?1",
            id
        )?
        .first(None)
        .await?;
        let Some(current) = current else {
            return Ok(CampaignWrite::Conflict);
        };
        if current.status != "draft" {
            return Ok(if current.subject == subject && current.html == html {
                CampaignWrite::AlreadyQueued
            } else {
                CampaignWrite::Conflict
            });
        }
        let updated: Option<String> = worker::query!(
            &self.db,
            "UPDATE campaigns SET subject=?2,html=?3,updated_at=?4 WHERE id=?1 AND status='draft' RETURNING id",
            id,
            subject,
            html,
            now
        )?
        .first(Some("id"))
        .await?;
        Ok(if updated.is_some() {
            CampaignWrite::Updated
        } else {
            CampaignWrite::Conflict
        })
    }

    /// 在一个 D1 批处理事务中快照当前已确认订阅者并入队，重复调用不会新增收件人。
    /// Snapshot current confirmed subscribers and enqueue in one D1 batch transaction; repeats add no recipients.
    pub async fn enqueue(&self, id: &str, now: i64) -> Result<bool> {
        let status: Option<String> =
            worker::query!(&self.db, "SELECT status FROM campaigns WHERE id=?1", id)?
                .first(Some("status"))
                .await?;
        if status.as_deref() != Some("draft") {
            return Ok(false);
        }
        let insert = worker::query!(
            &self.db,
            "INSERT INTO deliveries(campaign_id,email,status,available_at) \
             SELECT ?1,email,'pending',?2 FROM subscribers WHERE status='confirmed' \
             AND EXISTS (SELECT 1 FROM campaigns WHERE id=?1 AND status='draft') \
             ON CONFLICT(campaign_id,email) DO NOTHING",
            id,
            now
        )?;
        let update = worker::query!(
            &self.db,
            "UPDATE campaigns SET status='queued',updated_at=?2 WHERE id=?1 AND status='draft'",
            id,
            now
        )?;
        self.db.batch(vec![insert, update]).await?;
        Ok(true)
    }

    /// 查询活动状态及各投递状态数量，不暴露收件人信息。
    /// Read campaign and delivery counts without exposing recipient data.
    pub async fn campaign_status(&self, id: &str) -> Result<Option<CampaignStatus>> {
        worker::query!(
            &self.db,
            "SELECT c.id,c.status, \
               COUNT(*) FILTER (WHERE d.status='pending') AS pending, \
               COUNT(*) FILTER (WHERE d.status='sending') AS sending, \
               COUNT(*) FILTER (WHERE d.status='sent') AS sent, \
               COUNT(*) FILTER (WHERE d.status='failed') AS failed, \
               COUNT(*) FILTER (WHERE d.status='unknown') AS unknown, \
               COUNT(*) FILTER (WHERE d.status='skipped') AS skipped \
             FROM campaigns c LEFT JOIN deliveries d ON d.campaign_id=c.id \
             WHERE c.id=?1 GROUP BY c.id,c.status",
            id
        )?
        .first(None)
        .await
    }

    /// 原子领取待投递任务；仅显式失败可重试，过期 `sending` 不可再次领取。
    /// Atomically claim work; only explicit failures are retryable, never expired `sending` rows.
    pub async fn claim_batch(
        &self,
        limit: i32,
        now: i64,
        lease_until: i64,
    ) -> Result<Vec<Delivery>> {
        let limit = limit.clamp(1, 100);
        let claimed = worker::query!(
            &self.db,
            "UPDATE deliveries SET status='sending',attempts=attempts+1,lease_expires_at=?2 \
             WHERE rowid IN (SELECT d.rowid FROM deliveries d JOIN subscribers s ON s.email=d.email \
               JOIN campaigns c ON c.id=d.campaign_id WHERE d.status IN ('pending','failed') \
               AND d.available_at<=?1 AND s.status='confirmed' AND c.status='queued' \
               ORDER BY d.available_at,d.rowid LIMIT ?3) \
             RETURNING campaign_id,email,attempts,lease_expires_at",
            now,
            lease_until,
            limit
        )?
        .all()
        .await?
        .results::<Claimed>()?;
        let mut deliveries = Vec::with_capacity(claimed.len());
        for row in claimed {
            let content: Option<DeliveryContent> = worker::query!(
                &self.db,
                "SELECT subject,html FROM campaigns WHERE id=?1",
                row.campaign_id,
            )?
            .first(None)
            .await?;
            if let Some(content) = content {
                deliveries.push(Delivery {
                    campaign_id: row.campaign_id,
                    email: row.email,
                    subject: content.subject,
                    html: content.html,
                    attempts: row.attempts,
                    lease_expires_at: row.lease_expires_at,
                });
            }
        }
        Ok(deliveries)
    }

    /// 仅租约持有者可记录成功；返回 `false` 表示状态已改变。
    /// Only the lease holder can record success; `false` means the state changed.
    pub async fn mark_sent(
        &self,
        campaign_id: &str,
        email: &str,
        lease_expires_at: i64,
        now: i64,
    ) -> Result<bool> {
        let changed: Option<String> = worker::query!(
            &self.db,
            "UPDATE deliveries SET status='sent',sent_at=?4,lease_expires_at=NULL,last_error=NULL \
             WHERE campaign_id=?1 AND email=?2 AND status='sending' AND lease_expires_at=?3 RETURNING email",
            campaign_id,
            email,
            lease_expires_at,
            now
        )?
        .first(Some("email"))
        .await?;
        Ok(changed.is_some())
    }

    /// 在发送前发现用户已退订时，租约持有者可将任务安全跳过。
    /// When consent was withdrawn before sending, the lease holder may safely skip the delivery.
    pub async fn mark_skipped(
        &self,
        campaign_id: &str,
        email: &str,
        lease_expires_at: i64,
    ) -> Result<bool> {
        let changed: Option<String> = worker::query!(
            &self.db,
            "UPDATE deliveries SET status='skipped',lease_expires_at=NULL,last_error=NULL \
             WHERE campaign_id=?1 AND email=?2 AND status='sending' AND lease_expires_at=?3 RETURNING email",
            campaign_id,
            email,
            lease_expires_at
        )?
        .first(Some("email"))
        .await?;
        Ok(changed.is_some())
    }

    /// 仅确定发送前或服务商明确拒绝的错误才可标记失败并安排重试。
    /// Mark failed and retry only for errors known to occur before acceptance or explicit provider rejection.
    pub async fn mark_failed(
        &self,
        campaign_id: &str,
        email: &str,
        lease_expires_at: i64,
        error: &str,
        retry_at: i64,
    ) -> Result<bool> {
        let changed: Option<String> = worker::query!(
            &self.db,
            "UPDATE deliveries SET status='failed',available_at=?5,lease_expires_at=NULL,last_error=?4 \
             WHERE campaign_id=?1 AND email=?2 AND status='sending' AND lease_expires_at=?3 RETURNING email",
            campaign_id,
            email,
            lease_expires_at,
            error,
            retry_at
        )?
        .first(Some("email"))
        .await?;
        Ok(changed.is_some())
    }

    /// 服务商明确拒绝额度请求时，推迟此活动尚未发送的任务；不会提前已有的较晚重试时间。
    /// On an explicit provider quota rejection, defer unsent campaign work without pulling forward later retries.
    pub async fn defer_campaign(&self, id: &str, available_at: i64) -> Result<()> {
        worker::query!(
            &self.db,
            "UPDATE deliveries SET available_at=MAX(available_at,?2) \
             WHERE campaign_id=?1 AND status IN ('pending','failed')",
            id,
            available_at
        )?
        .run()
        .await?;
        Ok(())
    }

    /// 将过期但结果不明的租约转为人工核对状态，不自动重复发送。
    /// Move expired ambiguous leases to manual reconciliation, never automatic resend.
    pub async fn mark_unknown_stale(&self, now: i64) -> Result<()> {
        worker::query!(
            &self.db,
            "UPDATE deliveries SET status='unknown',last_error='lease expired; reconcile provider status before retry' \
             WHERE status='sending' AND lease_expires_at<=?1",
            now
        )?
        .run()
        .await?;
        Ok(())
    }

    /// 已发送或退订跳过的活动变为完成；未知结果会阻止完成，供人工处理。
    /// Complete campaigns whose deliveries were sent or skipped; unknown outcomes block completion for review.
    pub async fn complete_campaigns(&self, now: i64) -> Result<()> {
        worker::query!(
            &self.db,
            "UPDATE campaigns SET status='complete',updated_at=?1 WHERE status='queued' \
             AND NOT EXISTS (SELECT 1 FROM deliveries WHERE campaign_id=campaigns.id \
               AND status NOT IN ('sent','skipped'))",
            now
        )?
        .run()
        .await?;
        Ok(())
    }
}
