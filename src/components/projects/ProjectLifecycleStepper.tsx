import React from "react";
import { useTranslation } from "react-i18next";
import { Check, CircleDot, Clock } from "lucide-react";
import type { ProjectLifecycleStep } from "@/lib/project-types";

interface ProjectLifecycleStepperProps {
  steps: ProjectLifecycleStep[];
}

export function ProjectLifecycleStepper({ steps }: ProjectLifecycleStepperProps) {
  const { i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");

  return (
    <div className="rounded-xl border bg-card p-4 shadow-xs overflow-x-auto">
      <div className="flex items-center min-w-[950px] relative py-2">
        {steps.map((step, idx) => {
          const isCompleted = step.status === "completed";
          const isCurrent = step.status === "current";
          const isLast = idx === steps.length - 1;

          return (
            <React.Fragment key={step.stage}>
              {/* Step Circle & Label */}
              <div className="flex flex-col items-center relative z-10 shrink-0 group">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all shadow-xs ${
                    isCompleted
                      ? "bg-emerald-600 text-white"
                      : isCurrent
                        ? "bg-primary text-primary-foreground ring-4 ring-primary/20 scale-110 animate-pulse"
                        : "bg-muted text-muted-foreground border border-border"
                  }`}
                  title={step.detail || undefined}
                >
                  {isCompleted ? (
                    <Check className="w-4 h-4" />
                  ) : isCurrent ? (
                    <CircleDot className="w-4 h-4" />
                  ) : (
                    <span>{idx + 1}</span>
                  )}
                </div>

                <div className="text-center mt-2 w-20">
                  <p
                    className={`text-[11px] font-semibold leading-tight line-clamp-1 ${
                      isCurrent
                        ? "text-primary font-bold"
                        : isCompleted
                          ? "text-foreground"
                          : "text-muted-foreground"
                    }`}
                  >
                    {isAr ? step.labelAr : step.label}
                  </p>
                  {step.date && (
                    <p className="text-[10px] text-muted-foreground mt-0.5" dir="ltr">
                      {step.date}
                    </p>
                  )}
                </div>
              </div>

              {/* Connecting Line */}
              {!isLast && (
                <div
                  className={`flex-1 h-0.5 mx-1 -mt-6 transition-colors ${
                    isCompleted
                      ? "bg-emerald-500"
                      : isCurrent
                        ? "bg-gradient-to-r from-emerald-500 to-muted"
                        : "bg-border"
                  }`}
                />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}
