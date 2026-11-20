import { CalendarDays, CheckSquare, Files, GraduationCap, LayoutDashboard, MoreHorizontal, School, Settings, FolderOpen, BookOpen, CalendarClock, Bell } from "lucide-react";

export const routes = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/universities", label: "Universities", icon: School },
  { href: "/programs", label: "Programs", icon: BookOpen },
  { href: "/scholarships", label: "Scholarships", icon: GraduationCap },
  { href: "/applications", label: "Applications", icon: Files },
  { href: "/calendar", label: "Calendar", icon: CalendarDays },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/deadlines", label: "Deadlines", icon: CalendarClock },
  { href: "/reminders", label: "Reminders", icon: Bell },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/settings", label: "Settings", icon: Settings },
] as const;

// Bottom bar fits five items; the rest live on /more.
const mobileHrefs = ["/", "/applications", "/tasks", "/calendar"];
export const mobileRoutes = [
  ...routes.filter((r) => mobileHrefs.includes(r.href)),
  { href: "/more", label: "More", icon: MoreHorizontal },
];
export const moreRoutes = routes.filter((r) => !mobileHrefs.includes(r.href));
