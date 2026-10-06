---
slug: llm-context-compaction-price-geometry
title:
  zh: "为记忆付费：大语言模型上下文压缩的价格几何与更新控制"
  en: "Paying to Remember: Price Geometry and Renewal Control of LLM Context Compaction"
summary:
  zh: "将上下文压缩视为摊销的工作状态重建，分析输入、缓存写入、缓存读取与输出价格如何共同决定压缩时机，并以 297,091 条公开编码智能体增长观测和 38 组报价向量检验其机制。"
  en: "A study of context compaction as amortized working-state reconstruction, analyzing how input, cache-write, cache-read, and output prices jointly determine reset timing using 297,091 public coding-agent growth observations and 38 quoted price vectors."
about:
  zh:
    - "长时间运行的大语言模型智能体反复为携带工作历史付费。上下文压缩（context compaction）虽然缩短上下文，却也需要生成摘要、重写可缓存前缀并恢复继续工作所需的材料，因此更少的上下文 token 未必意味着更低的账单。本文在固定普通工作量的条件下，建立区分四类价格的随机成本模型。"
    - "论文通过更新过程（renewal process）的累积占用量给出适用于连续增长分布与整数 token 平台区间的控制规则，分析缓存可靠性和冷态末尾内容如何逆转压缩方向，并用价格包络几何（price-envelope geometry）区分策略响应与账单响应。实验比较独立与分块重采样（block resampling）的工作负载，以及有限剩余任务长度，说明缓存可靠性与工作状态设计为何可能比精细调整阈值更重要。"
    - "本次发布提供英文论文及附录的完整 PDF；未附带独立的源码或数据归档。"
  en:
    - "Long-running LLM agents repeatedly pay to carry their working history. Compaction shortens context but also generates summaries, rewrites cacheable prefixes, and restores material needed to continue, so fewer context tokens need not imply a lower invoice. The paper develops a stochastic four-price ledger while holding ordinary work fixed."
    - "Integrated renewal occupation yields a control rule for continuous growth laws and integer-token plateaus. The analysis identifies compaction-direction reversals caused by cache reliability and cold terminal content, and uses price-envelope geometry to separate policy response from invoice response. Independent and block-resampled workloads and finite remaining horizons illustrate why cache reliability and working-state design can matter more than microscopic threshold tuning."
    - "This release contains the complete English paper and appendices as a PDF; no separate source or data archive is included."
published: 2026-10-07
tags: [LLM agents, context compaction, prompt caching, renewal processes, sensitivity analysis]
releases:
  - version: 1.0.0
    date: 2026-10-07
    notes:
      zh: "首次发布；保留所提供 PDF 的原始内容。"
      en: "Initial release; the supplied PDF is preserved unchanged."
    files:
      - id: paper
        label:
          zh: "为记忆付费：完整论文"
          en: "Paying to Remember: complete paper"
        path: paying-to-remember.pdf
        mediaType: application/pdf
        description:
          zh: "24 页英文论文，含理论推导、工作负载实验与附录。"
          en: "24-page English paper with theoretical derivations, workload experiments, and appendices."
        size: 734487
        checksum: 7c7a9c9eb6f4b0a26cc201640ff84b679efb2f5b496e42969090a3e7c05e455e
---
