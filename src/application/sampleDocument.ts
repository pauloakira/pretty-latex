/**
 * What the editor shows until files can be opened (the open/save card). It exercises
 * every highlight: commands, arguments, environments, inline and display math, comments.
 */
export const SAMPLE_DOCUMENT = String.raw`\documentclass[11pt]{article}
\usepackage{amsmath, amssymb, graphicx}

\title{On the Stability of Sparse Solvers}
\begin{document}
\maketitle

\section{Introduction}
% TODO: tighten the motivation
We study the linear system $Ax = b$ where
$A \in \mathbb{R}^{n \times n}$ is sparse and symmetric positive definite.

\begin{equation}
  \|x_k - x^*\|_A \le 2\left(\frac{\sqrt{\kappa}-1}{\sqrt{\kappa}+1}\right)^k \|x_0 - x^*\|_A
\end{equation}

\subsection{Contributions}
\begin{itemize}
  \item A preconditioner with $O(n \log n)$ setup cost.
  \item Bounds that hold for \emph{any} ordering \cite{saad03}.
\end{itemize}

\end{document}
`;
