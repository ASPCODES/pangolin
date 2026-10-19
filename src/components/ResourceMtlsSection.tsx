"use client";

import { PolicyAuthMethodRow } from "@app/components/resource-policy/PolicyAuthMethodRow";
import { ResourceMtlsCertificatesCredenza } from "@app/components/ResourceMtlsCertificatesCredenza";
import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionFooter,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "@app/components/Settings";
import { Alert, AlertDescription } from "@app/components/ui/alert";
import { Button } from "@app/components/ui/button";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useResourceContext } from "@app/hooks/useResourceContext";
import { toast } from "@app/hooks/useToast";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { resourceQueries } from "@app/lib/queries";
import type { UpdateResourceResponse } from "@server/routers/resource";
import { useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

export function ResourceMtlsSection() {
    const t = useTranslations();
    const { env } = useEnvContext();
    const { resource, updateResource } = useResourceContext();
    const api = createApiClient({ env });

    const supportsMtls =
        !env.flags.disableEnterpriseFeatures && resource.mode === "http";

    const { data: certificates = [], isLoading: isLoadingCertificates } =
        useQuery({
            ...resourceQueries.resourceMtlsCertificates({
                resourceId: resource.resourceId
            }),
            enabled: supportsMtls
        });

    const [mtlsEnabled, setMtlsEnabled] = useState(resource.mtlsEnabled);
    const [certificatesOpen, setCertificatesOpen] = useState(false);
    const [saving, setSaving] = useState(false);

    // The server switches mTLS off when the last CA is removed.
    useEffect(() => {
        setMtlsEnabled(resource.mtlsEnabled);
    }, [resource.mtlsEnabled]);

    if (!supportsMtls) {
        return null;
    }

    const hasCertificates = certificates.length > 0;

    function onToggle(active: boolean) {
        setMtlsEnabled(active);
        setCertificatesOpen(active);
    }

    function onCertificatesOpenChange(open: boolean) {
        setCertificatesOpen(open);
        // mTLS can't be enabled without a trusted CA.
        if (!open && !hasCertificates) {
            setMtlsEnabled(false);
        }
    }

    async function onSave() {
        setSaving(true);
        try {
            await api.post<AxiosResponse<UpdateResourceResponse>>(
                `/resource/${resource.resourceId}`,
                { mtlsEnabled }
            );
            updateResource({ mtlsEnabled });
            toast({
                title: t("resourceUpdated"),
                description: t("resourceUpdatedDescription")
            });
        } catch (e) {
            toast({
                variant: "destructive",
                title: t("resourceErrorUpdate"),
                description: formatAxiosError(
                    e,
                    t("resourceErrorUpdateDescription")
                )
            });
        } finally {
            setSaving(false);
        }
    }

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>{t("mtlsEnforcement")}</SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("mtlsEnforcementDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <div className="space-y-4">
                    {!resource.ssl && (
                        <Alert variant="warning">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>
                                {t("mtlsRequiresSsl")}
                            </AlertDescription>
                        </Alert>
                    )}
                    <PolicyAuthMethodRow
                        id="mtls"
                        title={t("enableMtls")}
                        description={t("enableMtlsDescription")}
                        summary={t("mtlsSummary", {
                            count: certificates.length
                        })}
                        active={mtlsEnabled}
                        onConfigure={() => setCertificatesOpen(true)}
                        onToggle={onToggle}
                        disabled={!resource.ssl}
                    />
                </div>
                <ResourceMtlsCertificatesCredenza
                    open={certificatesOpen}
                    onOpenChange={onCertificatesOpenChange}
                    certificates={certificates}
                    isLoading={isLoadingCertificates}
                />
            </SettingsSectionBody>
            <SettingsSectionFooter>
                <Button
                    type="button"
                    loading={saving}
                    disabled={
                        saving ||
                        mtlsEnabled === resource.mtlsEnabled ||
                        (mtlsEnabled && !hasCertificates)
                    }
                    onClick={onSave}
                >
                    {t("saveSettings")}
                </Button>
            </SettingsSectionFooter>
        </SettingsSection>
    );
}
