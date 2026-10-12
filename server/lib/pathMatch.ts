const segmentRegexCache = new Map<string, RegExp>();

function getSegmentRegex(patternPart: string): RegExp {
    let regex = segmentRegexCache.get(patternPart);
    if (!regex) {
        const regexPattern = patternPart
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, ".*")
            .replace(/\?/g, ".");
        regex = new RegExp(`^${regexPattern}$`);
        segmentRegexCache.set(patternPart, regex);
    }
    return regex;
}

// Decodes percent-encoding (so an encoded slash like `%2F` is treated as a
// real path separator, matching what most backends will do) and then
// resolves `.` / `..` segments, so a request like `/public%2F..%2Fadmin/`
// or `/public/../admin/` is matched as `/admin/`, not as a literal segment
// or a wildcard-swallowed sequence under `/public/*`.
//
// Applied to both the request path and the rule pattern: the pattern
// validator only accepts spaces / non-ASCII in percent-encoded form, so a
// rule like `/my%20docs/*` must be compared against the decoded segment
// `my docs`, not the literal text `my%20docs`.
function decodeAndResolvePath(p: string): string[] {
    const rawParts = p.split("/").filter(Boolean);

    const resolved: string[] = [];
    for (const rawPart of rawParts) {
        let part: string;
        try {
            part = decodeURIComponent(rawPart);
        } catch {
            part = rawPart;
        }

        // an encoded slash can turn one raw segment into several real ones
        for (const segment of part.split("/").filter(Boolean)) {
            if (segment === ".") {
                continue;
            } else if (segment === "..") {
                resolved.pop();
            } else {
                resolved.push(segment);
            }
        }
    }

    return resolved;
}

export function isPathAllowed(pattern: string, path: string): boolean {
    const patternParts = decodeAndResolvePath(pattern);
    const pathParts = decodeAndResolvePath(path);

    // Iterative dynamic-programming matcher. The previous recursive
    // implementation forked on every bare `*`, which backtracked
    // exponentially and let an unauthenticated path rule pin the event loop.
    // `dp[i][j]` is true when patternParts[i..] matches pathParts[j..].
    const m = patternParts.length;
    const n = pathParts.length;
    const dp: boolean[][] = Array.from({ length: m + 1 }, () =>
        new Array<boolean>(n + 1).fill(false)
    );

    dp[m][n] = true;
    for (let j = 0; j < n; j++) {
        dp[m][j] = false;
    }
    for (let i = m - 1; i >= 0; i--) {
        dp[i][n] = patternParts.slice(i).every((p) => p === "*");
    }

    for (let i = m - 1; i >= 0; i--) {
        const currentPatternPart = patternParts[i];
        for (let j = n - 1; j >= 0; j--) {
            if (currentPatternPart === "*") {
                // match zero segments, or consume one path segment
                dp[i][j] = dp[i + 1][j] || dp[i][j + 1];
            } else if (currentPatternPart.includes("*")) {
                const regex = getSegmentRegex(currentPatternPart);
                dp[i][j] = regex.test(pathParts[j]) && dp[i + 1][j + 1];
            } else {
                dp[i][j] =
                    currentPatternPart === pathParts[j] && dp[i + 1][j + 1];
            }
        }
    }

    return dp[0][0];
}
