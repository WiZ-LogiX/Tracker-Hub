import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { AttachmentUploader } from "@/components/attachment-uploader";
import { AttachmentList } from "@/components/attachment-list";
import { Folder, UploadCloud, ShieldAlert } from "lucide-react";

interface ProjectDocumentsTabProps {
  projectId: string;
}

export function ProjectDocumentsTab({ projectId }: ProjectDocumentsTabProps) {
  const { t, i18n } = useTranslation();
  const isAr = i18n.language.startsWith("ar");
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="space-y-6">
      {/* Upload Box */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center gap-2">
          <UploadCloud className="w-5 h-5 text-primary" />
          <CardTitle className="text-base font-bold">
            {isAr ? "رفع مستندات وتصميمات جديدة للمشروع" : "Upload Project Documents & Blueprints"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <AttachmentUploader
            entityType="opportunity"
            entityId={projectId}
            isPublic={false}
            onUploaded={() => setRefreshKey((k) => k + 1)}
          />
          <p className="text-[11px] text-muted-foreground mt-2 flex items-center gap-1">
            <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
            <span>
              {isAr
                ? "الملفات مخزنة بأمان على Cloudflare R2 وروابط التحميل موقّعة مؤقتاً ومحمية بالصلاحيات."
                : "Files are stored securely on Cloudflare R2 with signed expiring download URLs."}
            </span>
          </p>
        </CardContent>
      </Card>

      {/* Files List */}
      <Card className="shadow-xs">
        <CardHeader className="p-4 pb-3 border-b flex flex-row items-center gap-2">
          <Folder className="w-5 h-5 text-primary" />
          <CardTitle className="text-base font-bold">
            {isAr ? "مستندات وملفات المشروع" : "Project Attachments"}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          <AttachmentList
            entityType="opportunity"
            entityId={projectId}
            refreshKey={refreshKey}
            onChanged={() => setRefreshKey((k) => k + 1)}
          />
        </CardContent>
      </Card>
    </div>
  );
}
