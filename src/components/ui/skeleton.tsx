import { cn } from "cn"

// Pulses only when the user has not asked for reduced motion.
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return <div aria-hidden="true" data-slot="skeleton" className={cn("rounded-md bg-muted motion-safe:animate-pulse", className)} {...props} />
}

export { Skeleton }
