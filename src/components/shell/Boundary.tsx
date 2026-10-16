"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Keeps one failing section from taking down the sheet. The fallback is quiet:
 * a section that can't render simply steps aside (or shows `fallback`).
 */
export class Boundary extends Component<{ name: string; children: ReactNode; fallback?: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[sheet] "${this.props.name}" failed to render`, error, info.componentStack);
  }

  render() {
    if (this.state.failed) return this.props.fallback ?? null;
    return this.props.children;
  }
}
