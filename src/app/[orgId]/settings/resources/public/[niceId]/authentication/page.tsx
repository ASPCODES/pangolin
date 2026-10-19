"use client";

import { ResourceMtlsSection } from "@app/components/ResourceMtlsSection";
import { ResourcePolicyEditForm } from "@app/components/resource-policy/ResourcePolicyEditForm";
import { SettingsContainer } from "@app/components/Settings";

export default function ResourceAuthenticationPage() {
    return (
        <SettingsContainer>
            <ResourcePolicyEditForm section="authentication" />
            <ResourceMtlsSection />
        </SettingsContainer>
    );
}
