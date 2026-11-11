import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  listInAppNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type InAppNotification,
} from "@/lib/notifications.functions";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Bell,
  CheckCheck,
  CheckSquare,
  Clock,
  ExternalLink,
  Calendar,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";

function formatTimeAgo(dateInput: string | Date, isRtl: boolean): string {
  const diffSec = Math.floor((Date.now() - new Date(dateInput).getTime()) / 1000);
  if (diffSec < 60) return isRtl ? "الآن" : "Just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return isRtl ? `منذ ${diffMin} دقيقة` : `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return isRtl ? `منذ ${diffHours} ساعة` : `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return isRtl ? `منذ ${diffDays} يوم` : `${diffDays}d ago`;
}

export function NotificationBell() {
  const { i18n } = useTranslation();
  const isRtl = i18n.language === "ar";
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const listNotificationsFn = useServerFn(listInAppNotifications);
  const markReadFn = useServerFn(markNotificationRead);
  const markAllReadFn = useServerFn(markAllNotificationsRead);

  // Poll notifications every 20 seconds, and on window focus
  const { data, isLoading } = useQuery({
    queryKey: ["in-app-notifications"],
    queryFn: async () => {
      const res = await listNotificationsFn({ data: { limit: 25 } });
      return res as { notifications: InAppNotification[]; unreadCount: number };
    },
    refetchInterval: 20000,
    refetchOnWindowFocus: true,
  });

  const notifications = data?.notifications || [];
  const unreadCount = data?.unreadCount || 0;

  // Mark single as read mutation
  const markReadMutation = useMutation({
    mutationFn: async (notificationId: string) => {
      return await markReadFn({ data: { notificationId } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications"] });
    },
  });

  // Mark all as read mutation
  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      return await markAllReadFn({ data: undefined as any });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["in-app-notifications"] });
      toast.success(isRtl ? "تم تحديد جميع الإشعارات كمقروءة" : "All notifications marked as read");
    },
  });

  const handleNotificationClick = async (notif: InAppNotification) => {
    // 1. Mark notification read
    if (notif.status === "unread") {
      await markReadMutation.mutateAsync(notif.id);
    }
    // 2. Close popover
    setOpen(false);

    // 3. Navigate directly to task deep link
    const targetLink = notif.payload?.deepLink || (notif.payload?.taskId ? `/admin/tasks?taskId=${notif.payload.taskId}` : "/admin/tasks");

    if (targetLink.includes("?")) {
      const [path, queryString] = targetLink.split("?");
      const params = new URLSearchParams(queryString);
      const searchObj: Record<string, string> = {};
      params.forEach((val, key) => {
        searchObj[key] = val;
      });
      navigate({ to: path as any, search: searchObj as any });
    } else {
      navigate({ to: targetLink as any });
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground"
          aria-label={isRtl ? "الإشعارات" : "Notifications"}
          data-testid="notification-bell-btn"
        >
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] font-bold text-white shadow-xs animate-in zoom-in"
              data-testid="notification-badge"
            >
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align={isRtl ? "start" : "end"}
        sideOffset={8}
        className="w-80 sm:w-96 p-0 shadow-lg border rounded-xl"
        data-testid="notification-popover"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-foreground">
              {isRtl ? "الإشعارات" : "Notifications"}
            </span>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0.5 font-mono">
                {unreadCount} {isRtl ? "جديد" : "new"}
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllReadMutation.mutate()}
              disabled={markAllReadMutation.isPending}
              className="h-7 text-xs px-2 text-muted-foreground hover:text-foreground gap-1"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>{isRtl ? "تحديد الكل كمقروء" : "Mark all read"}</span>
            </Button>
          )}
        </div>

        {/* List of Notifications */}
        <ScrollArea className="max-h-[380px] overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="py-10 text-center px-4 text-muted-foreground space-y-2">
              <Inbox className="h-8 w-8 mx-auto opacity-30 stroke-1" />
              <p className="text-xs font-medium">
                {isRtl ? "لا توجد إشعارات حالياً" : "No notifications right now"}
              </p>
              <p className="text-[11px] text-muted-foreground/80">
                {isRtl
                  ? "عندما يتم تكليفك بمهام جديدة ستظهر هنا"
                  : "Assigned tasks will appear here in real time"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {notifications.map((item) => {
                const isUnread = item.status === "unread";
                const isTask = item.entityType === "task" || item.event === "task_assigned";
                const priority = item.payload?.priority;
                const dueDate = item.payload?.dueDate;

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`p-3.5 flex items-start gap-3 transition-colors cursor-pointer text-left rtl:text-right ${
                      isUnread
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "hover:bg-muted/40 opacity-80 hover:opacity-100"
                    }`}
                    data-testid={`notification-item-${item.id}`}
                  >
                    {/* Icon */}
                    <div
                      className={`h-8 w-8 rounded-lg shrink-0 flex items-center justify-center mt-0.5 ${
                        isUnread
                          ? "bg-primary text-primary-foreground shadow-xs"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      <CheckSquare className="h-4 w-4" />
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 truncate">
                          {item.reference && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                              {item.reference}
                            </span>
                          )}
                          {priority && (
                            <Badge
                              variant="outline"
                              className={`text-[9px] uppercase px-1 py-0 font-semibold ${
                                priority === "critical"
                                  ? "border-rose-300 text-rose-700 bg-rose-50"
                                  : priority === "high"
                                  ? "border-amber-300 text-amber-700 bg-amber-50"
                                  : "border-border text-muted-foreground"
                              }`}
                            >
                              {priority}
                            </Badge>
                          )}
                        </div>
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                          {formatTimeAgo(item.createdAt, isRtl)}
                        </span>
                      </div>

                      <p className="text-xs font-semibold text-foreground leading-snug line-clamp-2">
                        {item.payload?.title || (isRtl ? "مهمة عمل جديدة" : "New task assignment")}
                      </p>

                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                        {item.payload?.assignedBy && (
                          <span>
                            {isRtl ? "من: " : "By: "}
                            <span className="font-medium text-foreground">
                              {item.payload.assignedBy}
                            </span>
                          </span>
                        )}
                        {dueDate && (
                          <span className="flex items-center gap-1 font-mono text-[10px]">
                            <Calendar className="h-3 w-3" />
                            {new Date(dueDate).toLocaleDateString(isRtl ? "ar-EG" : "en-US")}
                          </span>
                        )}
                      </div>

                      <div className="pt-1 flex items-center gap-1 text-[11px] text-primary font-medium">
                        <span>{isRtl ? "عرض تفاصيل المهمة" : "View task details"}</span>
                        <ExternalLink className="h-3 w-3 rtl:rotate-180" />
                      </div>
                    </div>

                    {/* Unread indicator dot */}
                    {isUnread && (
                      <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-2" />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
