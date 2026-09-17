import { cn } from "@/lib/utils";

type OmniqoraLogoProps = {
  slogan?: string;
  theme?: "light" | "dark";
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
  showSlogan?: boolean;
};

const sizes = {
  xs: { wrap: "gap-1.5", mark: "h-6 w-6", name: "text-[15px]", slogan: "text-[5px]" },
  sm: { wrap: "gap-2", mark: "h-9 w-9", name: "text-xl", slogan: "text-[7px]" },
  md: { wrap: "gap-2.5", mark: "h-12 w-12", name: "text-[28px]", slogan: "text-[9px]" },
  lg: { wrap: "gap-3", mark: "h-16 w-16", name: "text-4xl", slogan: "text-[10px]" },
};

export function OmniqoraLogo({
  slogan = "Your business, working as one.",
  theme = "light",
  size = "md",
  className,
  showSlogan = true,
}: OmniqoraLogoProps) {
  const scale = sizes[size];
  const dark = theme === "dark";

  return (
    <span className={cn("inline-flex shrink-0 items-center", scale.wrap, className)} aria-label={`OmniQora — ${slogan}`}>
      <img
        src="/brand/omniqora-mark.svg"
        alt=""
        aria-hidden="true"
        className={cn("shrink-0 object-contain", scale.mark)}
      />
      <span className="flex min-w-0 flex-col justify-center">
        <span
          className={cn(
            "font-display font-bold leading-[0.9] tracking-normal",
            scale.name,
            dark ? "text-sidebar-accent-foreground" : "text-foreground",
          )}
        >
          Omni<span className={dark ? "text-sidebar-primary" : "text-primary"}>Qora</span>
        </span>
        {showSlogan ? (
          <span
            className={cn(
              "mt-1 whitespace-nowrap font-sans font-semibold leading-none tracking-normal",
              scale.slogan,
              dark ? "text-sidebar-foreground/70" : "text-muted-foreground",
            )}
          >
            {slogan}
          </span>
        ) : null}
      </span>
    </span>
  );
}