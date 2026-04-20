import React from "react";

type ButtonVariant = "primary" | "secondary" | "outline" | "ghost" | "social";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  children: React.ReactNode;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", children, ...props }, ref) => {
    
    // Base styles applied to all buttons
    const baseStyles = "inline-flex items-center justify-center font-semibold rounded-lg transition-all focus:outline-none focus:ring-4 disabled:opacity-50 disabled:pointer-events-none cursor-pointer";

    // Variant-specific styles
    const variants: Record<ButtonVariant, string> = {
      primary:
        "bg-indigo-600 text-white hover:bg-indigo-700 hover:-translate-y-0.5 active:translate-y-0 shadow-md shadow-indigo-100 focus:ring-indigo-500/20",
      secondary:
        "bg-slate-100 text-slate-900 hover:bg-slate-200 focus:ring-slate-300/50",
      outline:
        "border-2 border-slate-200 bg-transparent text-slate-700 hover:bg-slate-50 focus:ring-slate-300/50",
      ghost:
        "bg-transparent text-slate-600 hover:text-indigo-600 hover:bg-slate-100 focus:ring-slate-300/50",
      social:
        "border border-slate-200 bg-white text-slate-700 font-medium hover:bg-slate-50 focus:ring-slate-300/50",
    };

    // Size-specific styles
    const sizes: Record<ButtonSize, string> = {
      sm: "px-3 py-1.5 text-sm",
      md: "px-4 py-2.5 text-[15px]",
      lg: "px-6 py-3 text-base shadow-lg",
    };

    const combinedClassName = `${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`.trim();

    return (
      <button ref={ref} className={combinedClassName} {...props}>
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export { Button };
