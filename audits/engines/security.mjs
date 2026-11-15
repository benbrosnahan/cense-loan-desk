// Security scan. Adapted from PerfMaster's security engine.
import https from 'node:https';
import { URL } from 'node:url';

// --- Security header definitions ---

const SECURITY_HEADERS = [
  {
    name: 'Content-Security-Policy',
    key: 'content-security-policy',
    points: 10,
    category: 'headers',
    validate: (value) => {
      if (!value) return { score: 0, severity: 'critical', message: 'No CSP header. Add a Content-Security-Policy to prevent XSS and data injection attacks.' };
      const hasUnsafeInline = value.includes("'unsafe-inline'");
      const hasDefaultSrc = value.includes('default-src');
      const hasUnsafeEval = value.includes("'unsafe-eval'");
      // Sites with third-party auth (Clerk, Auth0, etc.) often require 'unsafe-inline' since
      // nonces/hashes cause browsers to ignore 'unsafe-inline', breaking injected scripts.
      // A well-scoped CSP with default-src + unsafe-inline is still a significant improvement over no CSP.
      if (hasUnsafeInline && !hasDefaultSrc) {
        return { score: 5, severity: 'warning', message: "CSP contains 'unsafe-inline' without a restrictive default-src. Add default-src 'self' to limit the attack surface." };
      }
      if (hasUnsafeEval && hasUnsafeInline) {
        return { score: 8, severity: 'info', message: "Worth +2 pts: remove 'unsafe-inline' and 'unsafe-eval' from script-src by adopting a nonce- or hash-based CSP (e.g. a per-request nonce set in middleware). Common with third-party auth; safe to leave if those scripts need it." };
      }
      if (hasUnsafeInline) {
        return { score: 8, severity: 'info', message: "Worth +2 pts: remove 'unsafe-inline' from script-src by switching to a nonce- or hash-based CSP (generate a per-request nonce in middleware and add it to each <script>). Often kept for third-party/injected scripts — safe to leave if you rely on them." };
      }
      if (hasUnsafeEval) {
        return { score: 8, severity: 'info', message: "Worth +2 pts: remove 'unsafe-eval' from script-src to prevent eval-based XSS. Refactor any code relying on dynamic code evaluation." };
      }
      return { score: 10, severity: 'info', message: 'CSP is configured.' };
    },
  },
  {
    name: 'Strict-Transport-Security',
    key: 'strict-transport-security',
    points: 8,
    category: 'headers',
    validate: (value) => {
      if (!value) return { score: 0, severity: 'critical', message: 'No HSTS header. Add Strict-Transport-Security to enforce HTTPS.' };
      const maxAgeMatch = value.match(/max-age=(\d+)/);
      const maxAge = maxAgeMatch ? parseInt(maxAgeMatch[1], 10) : 0;
      if (maxAge < 86400) return { score: 2, severity: 'warning', message: `HSTS max-age is ${maxAge}s (< 1 day). Increase to at least 31536000 (1 year).` };
      if (maxAge < 31536000) return { score: 5, severity: 'warning', message: `HSTS max-age is ${maxAge}s. Consider increasing to 31536000 (1 year) and adding includeSubDomains.` };
      const hasSubdomains = value.includes('includeSubDomains');
      const hasPreload = value.includes('preload');
      if (hasSubdomains && hasPreload) return { score: 8, severity: 'info', message: 'HSTS is fully configured with includeSubDomains and preload.' };
      if (hasSubdomains) return { score: 7, severity: 'info', message: 'HSTS is configured with includeSubDomains. Consider adding preload.' };
      return { score: 6, severity: 'info', message: 'HSTS is configured. Consider adding includeSubDomains and preload.' };
    },
  },
  {
    name: 'X-Content-Type-Options',
    key: 'x-content-type-options',
    points: 4,
    category: 'headers',
    validate: (value) => {
      if (!value) return { score: 0, severity: 'warning', message: 'Missing X-Content-Type-Options header. Add "nosniff" to prevent MIME-type sniffing.' };
      if (value.toLowerCase() === 'nosniff') return { score: 4, severity: 'info', message: 'X-Content-Type-Options: nosniff is set.' };
      return { score: 2, severity: 'warning', message: `X-Content-Type-Options has unexpected value: "${value}". Should be "nosniff".` };
    },
  },
  {
    name: 'X-Frame-Options',
    key: 'x-frame-options',
    points: 4,
    category: 'headers',
    validate: (value) => {
      if (!value) return { score: 0, severity: 'warning', message: 'Missing X-Frame-Options. Add "DENY" or "SAMEORIGIN" to prevent clickjacking.' };
      const upper = value.toUpperCase();
      if (upper === 'DENY' || upper === 'SAMEORIGIN') return { score: 4, severity: 'info', message: `X-Frame-Options: ${value} is set.` };
      return { score: 2, severity: 'warning', message: `X-Frame-Options has unexpected value: "${value}".` };
    },
  },
  {
    name: 'Referrer-Policy',
    key: 'referrer-policy',
    points: 2,
    category: 'headers',
    validate: (value) => {
      if (!value) return { score: 0, severity: 'info', message: 'No Referrer-Policy header. Consider adding one to control referrer information.' };
      const safe = ['no-referrer', 'same-origin', 'strict-origin', 'strict-origin-when-cross-origin'];
      if (safe.includes(value.toLowerCase())) return { score: 2, severity: 'info', message: `Referrer-Policy: ${value} is configured.` };
      if (value.toLowerCase() === 'unsafe-url') return { score: 0, severity: 'warning', message: 'Referrer-Policy: unsafe-url leaks full URL to all origins.' };
      return { score: 1, severity: 'info', message: `Referrer-Policy: ${value} is set.` };
    },
  },
  {
    name: 'Permissions-Policy',
    key: 'permissions-policy',
    points: 2,
    category: 'headers',
    validate: (value) => {
      if (!value) return { score: 0, severity: 'info', message: 'No Permissions-Policy header. Consider restricting browser features.' };
      return { score: 2, severity: 'info', message: 'Permissions-Policy is configured.' };
    },
  },
];

const TOTAL_HEADER_POINTS = SECURITY_HEADERS.reduce((sum, h) => sum + h.points, 0); // 30

// --- TLS inspection ---

function inspectTLS(url) {
  return new Promise((resolve, _reject) => {
    const parsed = new URL(url);
    // A plain HTTP URL gets no request at all. Headers and cookies stay empty, so every
    // header below reads as missing whatever the server actually sends.
    if (parsed.protocol !== 'https:') {
      resolve({
        version: 'none',
        cipher: 'none',
        certIssuer: 'none',
        certExpiry: 'none',
        certValid: false,
        headers: {},
        cookies: [],
      });
      return;
    }

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: parsed.port || 443,
        path: parsed.pathname + parsed.search,
        method: 'GET',
        timeout: 10000,
        headers: { 'User-Agent': 'cense-audit-kit' },
        // Don't reject unauthorized certs: we want to inspect them.
        rejectUnauthorized: false,
      },
      (res) => {
        const socket = res.socket;
        // A resumed TLS session has no peer certificate, so a second scan of one host in one
        // process sees issuer and expiry as unknown and the expiry checks below do not apply.
        const cert = socket.getPeerCertificate?.();
        const protocol = socket.getProtocol?.() || 'unknown';
        const cipher = socket.getCipher?.();

        const headers = {};
        for (const [key, value] of Object.entries(res.headers)) {
          if (value) headers[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
        }

        const cookies = res.headers['set-cookie'] || [];

        resolve({
          version: protocol,
          cipher: cipher?.name || 'unknown',
          certIssuer: cert?.issuer?.O || cert?.issuer?.CN || 'unknown',
          certExpiry: cert?.valid_to || 'unknown',
          certValid: socket.authorized ?? false,
          headers,
          cookies: Array.isArray(cookies) ? cookies : [cookies],
        });

        // Consume body to free socket.
        res.resume();
      }
    );

    req.on('error', (err) => {
      console.error(`[SecurityScan] TLS inspection failed: ${err.message}`);
      resolve({
        version: 'error',
        cipher: 'error',
        certIssuer: 'error',
        certExpiry: 'error',
        certValid: false,
        headers: {},
        cookies: [],
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({
        version: 'timeout',
        cipher: 'timeout',
        certIssuer: 'timeout',
        certExpiry: 'timeout',
        certValid: false,
        headers: {},
        cookies: [],
      });
    });

    req.end();
  });
}

// --- Cookie parsing ---

function parseCookies(rawCookies) {
  return rawCookies.map((cookie) => {
    const parts = cookie.split(';').map((p) => p.trim());
    const nameValue = parts[0] || '';
    const name = nameValue.split('=')[0] || 'unknown';
    const flags = parts.slice(1).map((p) => p.toLowerCase());

    return {
      name,
      secure: flags.some((f) => f === 'secure'),
      httpOnly: flags.some((f) => f === 'httponly'),
      sameSite: flags.find((f) => f.startsWith('samesite='))?.split('=')[1] || 'none',
    };
  });
}

// --- Main scanner ---

// lhr is the Lighthouse result for the same url. Its audits feed the mixed-content, CSP,
// external-script, noopener and dependency checks. With no lhr those checks are skipped.
export async function runSecurityScan(url, lhr) {
  const findings = [];

  // 1. TLS + headers + cookies from an HTTP request.
  const tlsResult = await inspectTLS(url);

  const scanData = {
    tls: {
      version: tlsResult.version,
      cipher: tlsResult.cipher,
      certIssuer: tlsResult.certIssuer,
      certExpiry: tlsResult.certExpiry,
      certValid: tlsResult.certValid,
    },
    headers: {},
    cookies: parseCookies(tlsResult.cookies),
  };

  // --- HTTPS score ---

  let httpsScore = 100;
  const isHttps = url.startsWith('https://');

  if (!isHttps) {
    httpsScore = 0;
    findings.push({
      id: 'not-https',
      category: 'https',
      severity: 'critical',
      title: 'Page not served over HTTPS',
      description: 'This page is served over HTTP, which means all data is transmitted unencrypted.',
      recommendation: 'Configure your server to serve this page over HTTPS and redirect HTTP to HTTPS.',
    });
  } else if (!tlsResult.certValid) {
    httpsScore = 30;
    findings.push({
      id: 'invalid-cert',
      category: 'https',
      severity: 'critical',
      title: 'SSL certificate is invalid',
      description: 'The SSL certificate could not be verified. This may indicate an expired, self-signed, or misconfigured certificate.',
      recommendation: 'Renew or replace your SSL certificate with one from a trusted certificate authority.',
      details: { certExpiry: tlsResult.certExpiry, certIssuer: tlsResult.certIssuer },
    });
  } else {
    // Check cert expiry.
    try {
      const expiryDate = new Date(tlsResult.certExpiry);
      const daysUntilExpiry = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      if (daysUntilExpiry < 0) {
        httpsScore = 20;
        findings.push({
          id: 'cert-expired',
          category: 'https',
          severity: 'critical',
          title: 'SSL certificate has expired',
          description: `The certificate expired ${Math.abs(daysUntilExpiry)} days ago.`,
          recommendation: 'Renew your SSL certificate immediately.',
          details: { certExpiry: tlsResult.certExpiry, daysUntilExpiry },
        });
      } else if (daysUntilExpiry < 30) {
        httpsScore = 80;
        findings.push({
          id: 'cert-expiring-soon',
          category: 'https',
          severity: 'warning',
          title: 'SSL certificate expires soon',
          description: `The certificate expires in ${daysUntilExpiry} days.`,
          recommendation: 'Renew your SSL certificate before it expires.',
          details: { certExpiry: tlsResult.certExpiry, daysUntilExpiry },
        });
      } else {
        findings.push({
          id: 'cert-valid',
          category: 'https',
          severity: 'info',
          title: 'SSL certificate is valid',
          description: `Certificate expires in ${daysUntilExpiry} days (${tlsResult.certExpiry}).`,
          recommendation: '',
          details: { certExpiry: tlsResult.certExpiry, daysUntilExpiry, certIssuer: tlsResult.certIssuer },
        });
      }
    } catch {
      // Can't parse expiry date: skip.
    }

    // Check TLS version.
    if (tlsResult.version === 'TLSv1' || tlsResult.version === 'TLSv1.1') {
      httpsScore = Math.min(httpsScore, 60);
      findings.push({
        id: 'outdated-tls',
        category: 'https',
        severity: 'warning',
        title: `Outdated TLS version: ${tlsResult.version}`,
        description: 'TLS 1.0 and 1.1 are deprecated and have known vulnerabilities.',
        recommendation: 'Upgrade to TLS 1.2 or TLS 1.3.',
      });
    } else if (tlsResult.version === 'TLSv1.3') {
      findings.push({
        id: 'tls-1-3',
        category: 'https',
        severity: 'info',
        title: 'Using TLS 1.3',
        description: 'The latest and most secure TLS version is in use.',
        recommendation: '',
      });
    }
  }

  // Check Lighthouse is-on-https audit for mixed content.
  const httpsAudit = lhr?.audits?.['is-on-https'];
  if (httpsAudit && httpsAudit.score !== null && httpsAudit.score < 1) {
    const insecureUrls = httpsAudit.details?.items || [];
    const count = insecureUrls.length;
    httpsScore = Math.max(0, httpsScore - count * 10);
    findings.push({
      id: 'mixed-content',
      category: 'https',
      severity: 'warning',
      title: `${count} resource${count > 1 ? 's' : ''} loaded over HTTP`,
      description: 'Some resources are loaded over insecure HTTP on an HTTPS page.',
      recommendation: 'Update all resource URLs to use HTTPS.',
      details: { urls: insecureUrls.slice(0, 10).map((i) => i.url) },
    });
  }

  // --- Headers score ---

  let headerPoints = 0;
  const securityHeaders = {};

  for (const headerDef of SECURITY_HEADERS) {
    const value = tlsResult.headers[headerDef.key] || '';
    securityHeaders[headerDef.key] = value;
    const result = headerDef.validate(value);
    headerPoints += result.score;

    // A finding loses points whenever it earned less than the header's max,
    // regardless of severity. The validate() message already explains how to
    // earn the rest (e.g. "remove 'unsafe-eval'", "add includeSubDomains"), so
    // surface it as the recommendation instead of blanking it for 'info'.
    const losesPoints = result.score < headerDef.points;
    findings.push({
      id: value ? `header-${headerDef.key}` : `missing-${headerDef.key}`,
      category: 'headers',
      severity: result.severity,
      title: value ? `${headerDef.name}: configured` : `Missing ${headerDef.name}`,
      description: result.message,
      recommendation: losesPoints ? result.message : '',
      maxPoints: headerDef.points,
      pointsEarned: result.score,
    });
  }

  scanData.headers = securityHeaders;
  const headersScore = Math.round((headerPoints / TOTAL_HEADER_POINTS) * 100);

  // Check Lighthouse CSP-XSS audit.
  const cspAudit = lhr?.audits?.['csp-xss'];
  if (cspAudit && cspAudit.score !== null && cspAudit.score < 1) {
    findings.push({
      id: 'csp-xss-ineffective',
      category: 'headers',
      severity: 'warning',
      title: 'CSP is not effective against XSS',
      description: cspAudit.description || 'The Content-Security-Policy does not effectively prevent XSS attacks.',
      recommendation: "Review CSP directives. Avoid 'unsafe-inline' and 'unsafe-eval'. Use nonces or hashes.",
    });
  }

  // --- Cookies score ---

  let cookiesScore = 100;
  const cookies = scanData.cookies;

  if (cookies.length > 0) {
    let secureCount = 0;
    for (const cookie of cookies) {
      const allFlags = cookie.secure && cookie.httpOnly && cookie.sameSite !== 'none';
      if (allFlags) {
        secureCount++;
      } else {
        const missing = [];
        if (!cookie.secure) missing.push('Secure');
        if (!cookie.httpOnly) missing.push('HttpOnly');
        if (cookie.sameSite === 'none') missing.push('SameSite');

        findings.push({
          id: `cookie-${cookie.name}-insecure`,
          category: 'cookies',
          severity: 'warning',
          title: `Cookie "${cookie.name}" missing ${missing.join(', ')} flag${missing.length > 1 ? 's' : ''}`,
          description: `The cookie is missing security flags: ${missing.join(', ')}.`,
          recommendation: `Add ${missing.join(', ')} flag${missing.length > 1 ? 's' : ''} to the Set-Cookie header for "${cookie.name}".`,
          details: { cookie },
        });
      }
    }
    cookiesScore = Math.round((secureCount / cookies.length) * 100);
  }
  // No cookies = 100 (no risk).

  // --- Content score (mixed content + SRI) ---

  let contentScore = 100;

  // Check CORS: overly permissive.
  const corsHeader = tlsResult.headers['access-control-allow-origin'];
  if (corsHeader === '*') {
    contentScore = Math.max(0, contentScore - 20);
    findings.push({
      id: 'cors-wildcard',
      category: 'content',
      severity: 'warning',
      title: 'CORS allows all origins',
      description: 'Access-Control-Allow-Origin is set to "*", allowing any website to make requests.',
      recommendation: 'Restrict CORS to specific trusted origins instead of using a wildcard.',
    });
  }

  // Check for external scripts without SRI from Lighthouse network-requests.
  const networkAudit = lhr?.audits?.['network-requests'];
  if (networkAudit?.details?.items) {
    const items = networkAudit.details.items;
    const externalScripts = items.filter(
      (i) => i.resourceType === 'Script' && i.url && !i.url.startsWith(url.split('/').slice(0, 3).join('/'))
    );
    // Lighthouse doesn't directly expose SRI info in network-requests,
    // so the presence of external scripts is flagged as informational.
    if (externalScripts.length > 0) {
      findings.push({
        id: 'external-scripts',
        category: 'content',
        severity: 'info',
        title: `${externalScripts.length} external script${externalScripts.length > 1 ? 's' : ''} loaded`,
        description: 'External scripts are loaded from third-party domains. Ensure they use Subresource Integrity (SRI) hashes.',
        recommendation: 'Add integrity="sha384-..." attributes to external <script> tags.',
        details: { urls: externalScripts.slice(0, 5).map((s) => s.url) },
      });
    }
  }

  // Check Lighthouse external-anchors-use-rel-noopener.
  const noopenerAudit = lhr?.audits?.['external-anchors-use-rel-noopener'];
  if (noopenerAudit && noopenerAudit.score !== null && noopenerAudit.score < 1) {
    contentScore = Math.max(0, contentScore - 10);
    const items = noopenerAudit.details?.items || [];
    findings.push({
      id: 'missing-rel-noopener',
      category: 'content',
      severity: 'warning',
      title: 'External links missing rel="noopener"',
      description: `${items.length} link${items.length > 1 ? 's' : ''} with target="_blank" lack rel="noopener", which can expose the page to window.opener attacks.`,
      recommendation: 'Add rel="noopener noreferrer" to all links with target="_blank".',
      details: { urls: items.slice(0, 5).map((i) => i.href) },
    });
  }

  // --- Dependencies score ---

  // Keyed on the audit's verdict, not on whether Lighthouse ran. `no-vulnerable-libraries`
  // was removed from Lighthouse after v11, so on current versions there is no verdict.
  // `null` means unmeasured: the overall score below renormalizes over the categories that
  // were actually measured, so deps does not donate 15 free points for a check nobody ran.
  const vulnAudit = lhr?.audits?.['no-vulnerable-libraries'];
  const vulnMeasured = !!vulnAudit && typeof vulnAudit.score === 'number';
  let depsScore = vulnMeasured ? 100 : null;

  if (vulnMeasured && vulnAudit.score < 1) {
    const vulns = vulnAudit.details?.items || [];

    for (const vuln of vulns) {
      const severity = vuln.highestSeverity?.toLowerCase();
      let deduction = 10;
      let findingSeverity = 'warning';
      if (severity === 'critical') { deduction = 40; findingSeverity = 'critical'; }
      else if (severity === 'high') { deduction = 25; findingSeverity = 'critical'; }
      else if (severity === 'medium') { deduction = 10; findingSeverity = 'warning'; }
      else if (severity === 'low') { deduction = 5; findingSeverity = 'warning'; }

      depsScore = Math.max(0, (depsScore ?? 100) - deduction);
      findings.push({
        id: `vuln-${(vuln.detectedLib?.text || 'unknown').replace(/[^a-z0-9]/gi, '-').toLowerCase()}`,
        category: 'deps',
        severity: findingSeverity,
        title: `Vulnerable library: ${vuln.detectedLib?.text || 'unknown'}`,
        description: `${vuln.vulnCount} known vulnerabilit${vuln.vulnCount > 1 ? 'ies' : 'y'} (highest severity: ${vuln.highestSeverity}).`,
        recommendation: `Update ${vuln.detectedLib?.text || 'this library'} to the latest version.`,
        details: { library: vuln.detectedLib?.text, vulnCount: vuln.vulnCount, severity: vuln.highestSeverity },
      });
    }
  }

  if (!vulnMeasured) {
    // Do not claim a clean bill of health we never verified.
    findings.push({
      id: 'vulnerable-libs-check-skipped',
      category: 'deps',
      severity: 'info',
      maxPoints: 0,
      pointsEarned: 0,
      title: 'JavaScript dependency check not run',
      description: "The Lighthouse report contained no verdict for the dependency audit — Lighthouse removed `no-vulnerable-libraries` after v11 and the version in use does not ship it. Nothing about this page's JavaScript libraries was verified.",
      recommendation: 'This category is reported as unmeasured and excluded from the overall score — it is NOT counted as passing.',
    });
  } else if (depsScore === 100) {
    findings.push({
      id: 'no-vulnerable-libs',
      category: 'deps',
      severity: 'info',
      title: 'No known vulnerable libraries detected',
      description: 'All detected JavaScript libraries are free of known vulnerabilities.',
      recommendation: '',
    });
  }

  // --- Overall score ---

  // Renormalized over measured categories only. Substituting a number for an unmeasured
  // category either hands out free points (100) or invents a defect (0). Dropping it from
  // the denominator instead reports "of what we could inspect, this is the score".
  const weighted = [
    [httpsScore, 0.25],
    [headersScore, 0.30],
    [cookiesScore, 0.15],
    [contentScore, 0.15],
    [depsScore, 0.15],
  ];
  let weightedSum = 0;
  let measuredWeight = 0;
  for (const [value, weight] of weighted) {
    if (value === null) continue;
    weightedSum += value * weight;
    measuredWeight += weight;
  }
  const score = measuredWeight > 0 ? Math.max(0, Math.round(weightedSum / measuredWeight)) : 0;

  return {
    score,
    categories: {
      https: httpsScore,
      headers: headersScore,
      cookies: cookiesScore,
      content: contentScore,
      deps: depsScore,
    },
    findings,
    scanData,
  };
}
