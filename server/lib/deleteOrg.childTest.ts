// Test child for deleteOrg.test.ts. Boots the real sqlite driver against a
// fresh database in the temp workdir (cwd), seeds an org with two wireguard
// sites and two newt sites, runs deleteOrgById against a local HTTP stand-in
// for the exit node, and prints one JSON line of observations.
// The app boots with `import "./extendZod"` before anything else; zod
// schemas in the import chain use .openapi(), so do the same here.
import "@server/extendZod";
import http from "http";
import { deleteOrgById } from "@server/lib/deleteOrg";
import {
    db,
    exitNodes,
    orgs,
    sites,
    newts,
    newtSessions,
    clientSitesAssociationsCache
} from "@server/db";
import { sql } from "drizzle-orm";

const peerRemovals: string[] = [];
const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
        if (req.method === "DELETE") {
            if (!req.url) {
                res.writeHead(200, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ status: "ok" }));
                return;
            }
            const url = new URL(req.url, "http://localhost");
            const pubKey = url.searchParams.get("public_key");
            if (pubKey !== null) {
                peerRemovals.push(pubKey);
            }
        }
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ status: "ok" }));
    });
});

server.listen(0, "127.0.0.1", async () => {
    const addr = server.address();
    if (addr === null || typeof addr === "string") {
        throw new Error("failed to bind the stub exit node");
    }
    const port = addr.port;
    try {
        await db.insert(exitNodes).values({
            exitNodeId: 1,
            name: "en",
            address: "10.0.0.1",
            endpoint: "10.0.0.1:51820",
            publicKey: "enKey",
            listenPort: 51820,
            reachableAt: "http://127.0.0.1:" + port,
            type: "wireguard"
        });
        await db.insert(orgs).values({
            orgId: "org1",
            name: "Org",
            settingsJitModeLimit: 1
        });
        for (let i = 1; i <= 2; i++) {
            await db.insert(sites).values({
                siteId: i,
                orgId: "org1",
                niceId: String(i),
                name: "wg" + i,
                pubKey: "wgKey" + i,
                exitNodeId: 1,
                type: "wireguard"
            });
        }
        for (let i = 3; i <= 4; i++) {
            await db.insert(sites).values({
                siteId: i,
                orgId: "org1",
                niceId: String(i),
                name: "newt" + i,
                pubKey: "newtPub" + i,
                publicKey: "newtSession" + i,
                type: "newt"
            });
            await db.insert(newts).values({
                newtId: "newtId" + i,
                secretHash: "h" + i,
                dateCreated: "2026-01-01",
                siteId: i
            });
            await db.insert(newtSessions).values({
                sessionId: "sess" + i,
                newtId: "newtId" + i,
                expiresAt: 4102444800
            });
        }
        // A stale association-cache row pinned to one of the newt sites, the
        // kind cleanupSiteAssociations exists to clear.
        await db.insert(clientSitesAssociationsCache).values({
            clientId: 99,
            siteId: 3,
            isRelayed: false
        });

        const result = await deleteOrgById("org1");

        const row = (await db.get(
            sql`select
                (select count(*) from sites) as sites,
                (select count(*) from "newt") as newts,
                (select count(*) from "newtSession") as sessions,
                (select count(*) from clientSitesAssociationsCache where siteId = 3) as assoc`
        )) as {
            sites: number;
            newts: number;
            sessions: number;
            assoc: number;
        };

        console.log(
            "OBSERVATIONS " +
                JSON.stringify({
                    peerRemovals: peerRemovals.slice().sort(),
                    terminatedNewtIds: result.deletedNewtIds.slice().sort(),
                    sitesLeft: Number(row.sites),
                    newtsLeft: Number(row.newts),
                    sessionsLeft: Number(row.sessions),
                    associationRowsLeft: Number(row.assoc)
                })
        );
        server.close();
        process.exit(0);
    } catch (e: any) {
        console.error("CHILD_FAIL", e && e.message ? e.message : String(e));
        server.close();
        process.exit(1);
    }
});
