import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-white transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gray-400 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-blue-600 text-white hover:bg-blue-700",
        destructive: "bg-red-500 text-white hover:bg-red-600",
        outline: "border border-gray-300 bg-white hover:bg-gray-100 text-gray-900",
        secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200",
        ghost: "hover:bg-gray-100 text-gray-900",
        link: "text-blue-600 underline-offset-4 hover:underline",
        otrixPrimary: "bg-gradient-to-r from-[#6E2BFF] to-[#00A6FF] text-white shadow-[0_4px_16px_rgba(110,43,255,0.3)] hover:shadow-[0_0_20px_rgba(110,43,255,0.4),0_0_40px_rgba(110,43,255,0.2)] hover:-translate-y-0.5 active:translate-y-0",
        otrixSecondary: "bg-gradient-to-r from-[#E93AFF] to-[#6E2BFF] text-white shadow-[0_4px_16px_rgba(233,58,255,0.3)] hover:shadow-[0_0_20px_rgba(233,58,255,0.4),0_0_40px_rgba(233,58,255,0.2)] hover:-translate-y-0.5 active:translate-y-0",
        otrixGhost: "text-white hover:bg-white/5 border border-white/10 hover:border-[#6E2BFF]/30",
        otrixOutline: "border border-[#6E2BFF]/30 text-white hover:bg-[#6E2BFF]/10 hover:border-[#6E2BFF]/50",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-md px-3",
        lg: "h-11 rounded-md px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
