---
slug: cuda-jacobi-svd-kernel-fusion
title:
  zh: "CUDA GPU 上的单边 Jacobi SVD：性能剖析驱动的内核融合与数据移动优化"
  en: "One-sided Jacobi SVD on CUDA GPUs: Profiling-Guided Kernel Fusion and Data-Movement Optimization"
summary:
  zh: "一项关于 CUDA Jacobi SVD 执行粒度的性能研究：定位轮次级控制面开销，并以融合协作内核减少短内核、数据往返与同步边界。"
  en: "A performance study of CUDA Jacobi SVD execution granularity that identifies round-level control-plane overhead and reduces short kernels, data transfers, and synchronization boundaries with a fused cooperative kernel."
about:
  zh:
    - "本文结合端到端计时、Nsight Systems 与 Nsight Compute，说明朴素实现的主要瓶颈并非旋转公式或设备吞吐，而是 Jacobi 轮次与 CUDA Runtime 边界之间的粒度错配。"
    - "研究在十四类工作负载上评估融合协作内核，并通过重构误差、奇异值、有效子空间正交性与收敛轨迹检查数值行为。结果展示了性能剖析如何把可测量的控制面问题转化为可验证的执行结构优化。"
  en:
    - "Using end-to-end timing, Nsight Systems, and Nsight Compute, this paper shows that the baseline is limited less by the rotation formula or device throughput than by a mismatch between Jacobi rounds and CUDA Runtime boundaries."
    - "The study evaluates a fused cooperative kernel across fourteen workload classes and checks numerical behavior through reconstruction error, singular values, effective-subspace orthogonality, and convergence traces. It demonstrates how profiling evidence can turn a measurable control-plane problem into a verifiable execution-structure optimization."
published: 2026-05-16
tags: [CUDA, Jacobi SVD, kernel fusion, profiling, GPU]
license: All rights reserved
releases:
  - version: 1.0.0
    date: 2026-05-16
    notes:
      zh: 首次发布。
      en: Initial release.
    files:
      - id: paper
        label:
          zh: CUDA Jacobi SVD 性能论文
          en: CUDA Jacobi SVD performance paper
        path: cuda-jacobi-svd-kernel-fusion.pdf
        mediaType: application/pdf
        description:
          zh: 二十三页完整论文与附录。
          en: Complete 23-page paper with appendices.
---
