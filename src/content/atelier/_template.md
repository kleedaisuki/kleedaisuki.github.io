---
# @brief Atelier 条目模板 / Atelier entry template.
# 复制此文件并移除 draft，正文会成为作品详情页的说明。
# Copy this file and remove draft; the body becomes the work description.
draft: true
slug: example-work
title: Example work
summary: A concise description shown in the Atelier catalogue.
published: 2026-01-01
tags: [paper, code]
license: License not specified
# repository: https://github.com/owner/repository
# cover: /atelier-assets/example-work/1.0.0/cover.webp
releases:
  - version: 1.0.0
    date: 2026-01-01
    notes: Initial release.
    files:
      - id: paper
        label: Paper
        path: paper.pdf
        mediaType: application/pdf
        description: The primary document.
---

Write the durable description, reproduction notes, citations, and usage guidance here.

Place release files under `public/atelier-assets/<slug>/<version>/`. Place browsable
source under `src/atelier/<slug>/<version>/source/`; the site generates raw-file
downloads and a source ZIP automatically.
