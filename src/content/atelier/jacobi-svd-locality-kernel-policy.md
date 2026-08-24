---
slug: jacobi-svd-locality-kernel-policy
title:
  zh: "MPI 之前：单边 Jacobi SVD 中的局部性与内核策略"
  en: "Before MPI: Locality and Kernel Policy in One-Sided Jacobi SVD"
summary:
  zh: "一项覆盖 420 种配置的单边 Jacobi SVD 析因实验，比较六种矩阵布局、五种内核策略与十四类矩阵，区分局部性、收敛和并行包装开销。"
  en: "A 420-configuration factorial study of one-sided Jacobi SVD across six matrix layouts, five kernel policies, and fourteen matrix families, separating locality, convergence, and parallel-wrapper overhead."
about:
  zh:
    - "这项研究把单边 Jacobi SVD 作为并行数值程序的局部设计实验场，系统测量运行时间、内存占用、收敛行为与重构精度，并避免把 MPI 包装成本误读为分布式可扩展性。"
    - "实验发现列连续存储是当前实现中最重要的设计选择；更复杂的动态调度虽然减少部分 sweep，却不足以抵消观测成本。核心结论是：在跨 rank 扩展之前，本地内存轨迹与内核策略的成本模型必须先成立。"
  en:
    - "This study uses one-sided Jacobi SVD as a laboratory for local design choices in parallel numerical software. It measures runtime, memory footprint, convergence, and reconstruction accuracy while avoiding the mistake of treating MPI wrapper cost as evidence of distributed scalability."
    - "Column-contiguous storage emerges as the dominant choice in this implementation. More elaborate dynamic scheduling reduces some sweeps but does not repay its observation cost. The central lesson is that local memory trajectories and kernel-policy cost models must be sound before scaling across ranks."
published: 2026-05-28
tags: [MPI, Jacobi SVD, locality, numerical computing, benchmarking]
license: All rights reserved
releases:
  - version: 1.0.0
    date: 2026-05-28
    notes:
      zh: 首次发布。
      en: Initial release.
    files:
      - id: paper
        label:
          zh: Jacobi SVD 局部性与内核策略论文
          en: Jacobi SVD locality and kernel-policy paper
        path: jacobi-svd-locality-kernel-policy.pdf
        mediaType: application/pdf
        description:
          zh: 二十二页完整论文与实验附录。
          en: Complete 22-page paper with experimental appendices.
---
