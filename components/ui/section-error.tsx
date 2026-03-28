"use client";

import { Component, type ReactNode } from "react";

interface SectionErrorProps {
  name: string;
  children: ReactNode;
}

interface SectionErrorState {
  hasError: boolean;
}

export class SectionError extends Component<SectionErrorProps, SectionErrorState> {
  constructor(props: SectionErrorProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): SectionErrorState {
    return { hasError: true };
  }

  reset() {
    this.setState({ hasError: false });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="border border-[#0A0A0A]/10 bg-white p-6 flex items-center justify-between gap-4">
          <div>
            <p className="font-mono text-xs text-[#0A0A0A] uppercase tracking-wider">
              Failed to load {this.props.name}
            </p>
            <p className="font-mono text-[10px] text-[#0A0A0A]/40 mt-0.5">
              An unexpected error occurred in this section.
            </p>
          </div>
          <button
            type="button"
            onClick={() => this.reset()}
            className="shrink-0 px-3 py-1.5 border border-[#0A0A0A]/20 font-mono text-xs text-[#0A0A0A]/70 hover:border-[#0A0A0A]/50 hover:text-[#0A0A0A] transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
