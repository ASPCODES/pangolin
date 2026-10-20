import ResourceContext from "@app/contexts/resourceContext";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { createApiClient } from "@app/lib/api";
import { resourceQueries } from "@app/lib/queries";
import type { UpdateResourceResponse } from "@server/routers/resource";
import { useQuery } from "@tanstack/react-query";
import type { AxiosResponse } from "axios";
import { useContext, useEffect, useState } from "react";

// mTLS is a resource-level setting, so it is only available when editing
// authentication in the context of an HTTP resource.
export function useResourceMtls() {
    const resourceContext = useContext(ResourceContext);
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const resource = resourceContext?.resource;

    const supported =
        !!resource &&
        !env.flags.disableEnterpriseFeatures &&
        resource.mode === "http";

    const { data: certificates = [], isLoading: isLoadingCertificates } =
        useQuery({
            ...resourceQueries.resourceMtlsCertificates({
                resourceId: resource?.resourceId ?? 0
            }),
            enabled: supported
        });

    const [enabled, setEnabled] = useState(Boolean(resource?.mtlsEnabled));

    // The server switches mTLS off when the last CA is removed.
    useEffect(() => {
        setEnabled(Boolean(resource?.mtlsEnabled));
    }, [resource?.mtlsEnabled]);

    const hasCertificates = certificates.length > 0;
    const isDirty = supported && enabled !== Boolean(resource?.mtlsEnabled);

    async function save(): Promise<AxiosResponse | void> {
        if (!supported || !isDirty) return;
        const res = await api.post<AxiosResponse<UpdateResourceResponse>>(
            `/resource/${resource!.resourceId}`,
            { mtlsEnabled: enabled }
        );
        resourceContext!.updateResource({ mtlsEnabled: enabled });
        return res;
    }

    return {
        supported,
        sslEnabled: Boolean(resource?.ssl),
        enabled,
        setEnabled,
        certificates,
        isLoadingCertificates,
        hasCertificates,
        isDirty,
        save
    };
}
