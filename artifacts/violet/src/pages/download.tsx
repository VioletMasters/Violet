import React from "react";
import { Link } from "wouter";
import {
  ArrowRight,
  CheckCircle2,
  Download as DownloadIcon,
  ExternalLink,
  HardDriveDownload,
  Info,
  Loader2,
  Monitor,
  PackageCheck,
  Server,
  ShieldCheck,
  Smartphone,
} from "lucide-react";
import {
  getGetLatestReleaseQueryKey,
  useGetLatestRelease,
} from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils";

type Asset = {
  platform?: string;
  fileName?: string;
  sizeBytes?: number;
  downloadUrl?: string;
};

type Release = {
  version?: string;
  channel?: string;
  releaseNotes?: string | null;
  publishedAt?: string | null;
  assets?: Asset[];
};

const platformLabels: Record<string, string> = {
  windows: "Windows",
  macos: "macOS",
  linux: "Linux",
  docker: "Docker",
};

const platformDescriptions: Record<string, string> = {
  windows: "Installer for your Windows shop computer.",
  macos: "Package for a Mac running your local Violet server.",
  linux: "Package for a Linux server or shop computer.",
  docker: "Self-hosting bundle for Docker Desktop.",
};

function formatBytes(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes) || bytes <= 0) return "Package size unavailable";
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function assetUrl(url: string) {
  // Published asset URLs are returned by the API. Resolve them against the
  // current host so the download follows the same proxy as the app.
  return new URL(url, window.location.origin).toString();
}

export default function DownloadPage() {
  const releaseQuery = useGetLatestRelease(
    { channel: "stable" },
    { query: { queryKey: getGetLatestReleaseQueryKey({ channel: "stable" }), retry: false } },
  );
  const release = (releaseQuery.data ?? {}) as Release;
  const assets = Array.isArray(release.assets)
    ? release.assets.filter((asset) => asset.downloadUrl && asset.platform)
    : [];
  const primaryAsset = ["windows", "macos", "linux", "docker"]
    .map((platform) => assets.find((asset) => asset.platform === platform))
    .find(Boolean);
  const errorStatus = (releaseQuery.error as { status?: number } | null)?.status;
  const noRelease = releaseQuery.isError && errorStatus === 404;

  React.useEffect(() => {
    document.title = "Download Violet | Violet Enterprise";
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-8 pb-12">
      <div className="rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/10 via-card to-card p-6 shadow-sm sm:p-10">
        <div className="grid gap-8 lg:grid-cols-[1.25fr_.75fr] lg:items-center">
          <div>
            <Badge variant="outline" className="mb-4 border-primary/30 bg-primary/10 text-primary">
              <PackageCheck className="mr-1.5 h-3.5 w-3.5" />
              Your Violet workspace is ready
            </Badge>
            <h1 className="max-w-2xl text-3xl font-display font-bold tracking-tight sm:text-4xl">
              Download Violet before you start selling
            </h1>
            <p className="mt-4 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              Violet Enterprise is the software your team uses to run the point of sale.
              Download the newest stable release, install it on your shop computer, and
              connect your registers on the same network.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {primaryAsset?.downloadUrl ? (
                <a href={assetUrl(primaryAsset.downloadUrl)} download>
                  <Button size="lg" className="w-full gap-2 sm:w-auto">
                    <DownloadIcon className="h-4 w-4" />
                    Download {platformLabels[primaryAsset.platform ?? ""] ?? "Violet"}
                  </Button>
                </a>
              ) : (
                <Button size="lg" disabled className="w-full gap-2 sm:w-auto">
                  <DownloadIcon className="h-4 w-4" />
                  Download coming soon
                </Button>
              )}
              <Link href="/pos">
                <Button size="lg" variant="outline" className="w-full gap-2 sm:w-auto">
                  Open browser POS for now
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
            {release.version && (
              <p className="mt-4 text-xs text-muted-foreground">
                Stable release {release.version}
                {release.publishedAt ? ` · Published ${formatDateTime(release.publishedAt)}` : ""}
              </p>
            )}
          </div>
          <div className="hidden justify-center lg:flex">
            <div className="relative flex h-52 w-52 items-center justify-center rounded-full border border-primary/20 bg-background/70 shadow-inner">
              <div className="absolute inset-5 rounded-full border border-primary/20" />
              <div className="rounded-2xl bg-primary p-5 text-primary-foreground shadow-xl shadow-primary/25">
                <Monitor className="h-14 w-14" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {releaseQuery.isLoading && (
        <Card>
          <CardContent className="flex items-center gap-3 p-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
            Checking for the newest stable Violet release...
          </CardContent>
        </Card>
      )}

      {releaseQuery.isError && (
        <Card className={noRelease ? "border-amber-500/30 bg-amber-500/5" : "border-destructive/30"}>
          <CardContent className="flex gap-3 p-6">
            <Info className={`mt-0.5 h-5 w-5 shrink-0 ${noRelease ? "text-amber-600" : "text-destructive"}`} />
            <div>
              <p className="font-semibold">
                {noRelease ? "The first stable download is not published yet" : "We could not check the latest release"}
              </p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                {noRelease
                  ? "Your account is ready. This page will show the download as soon as a stable Violet package is published. You can use the browser POS in the meantime."
                  : "Please try again in a moment. You can still use the browser POS while the download service is unavailable."}
              </p>
              {!noRelease && (
                <Button variant="outline" size="sm" className="mt-3" onClick={() => void releaseQuery.refetch()}>
                  Try again
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {!releaseQuery.isLoading && !releaseQuery.isError && assets.length === 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="flex gap-3 p-6">
            <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold">This release has no downloadable package yet</p>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">
                The stable release is published, but its install package is still being prepared.
                Check back soon or use the browser POS in the meantime.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {assets.length > 0 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-2xl font-bold tracking-tight">Choose your setup</h2>
            <p className="mt-1 text-muted-foreground">Download the package that matches the computer hosting Violet.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {assets.map((asset) => (
              <Card key={asset.platform} className="border-border/60">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-3 text-lg">
                    <span className="rounded-lg bg-primary/10 p-2 text-primary">
                      {asset.platform === "docker" ? <Server className="h-5 w-5" /> : <Monitor className="h-5 w-5" />}
                    </span>
                    {platformLabels[asset.platform ?? ""] ?? asset.platform}
                  </CardTitle>
                  <CardDescription>{platformDescriptions[asset.platform ?? ""] ?? "Violet installation package."}</CardDescription>
                </CardHeader>
                <CardContent className="flex items-center justify-between gap-3">
                  <span className="truncate text-xs text-muted-foreground" title={asset.fileName}>
                    {asset.fileName} · {formatBytes(asset.sizeBytes)}
                  </span>
                  <a href={assetUrl(asset.downloadUrl!)} download>
                    <Button size="sm" variant={asset === primaryAsset ? "default" : "outline"} className="shrink-0 gap-1.5">
                      <DownloadIcon className="h-3.5 w-3.5" />
                      Download
                    </Button>
                  </a>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-5">
            <HardDriveDownload className="mb-4 h-6 w-6 text-primary" />
            <h3 className="font-semibold">1. Install on one computer</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Use the downloaded package on the computer that will host your local Violet service.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <WifiIcon />
            <h3 className="font-semibold">2. Connect your shop network</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Registers, tablets, and phones can connect when they are on the same trusted LAN.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <ShieldCheck className="mb-4 h-6 w-6 text-primary" />
            <h3 className="font-semibold">3. Sign in and get moving</h3>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Keep your account details handy. Violet uses them to open your business workspace.
            </p>
          </CardContent>
        </Card>
      </section>

      <div className="flex flex-col items-start justify-between gap-3 rounded-xl border border-border/60 bg-muted/30 p-4 text-sm text-muted-foreground sm:flex-row sm:items-center">
        <span className="flex items-center gap-2">
          <Smartphone className="h-4 w-4 text-primary" />
          Need to check something quickly? The browser POS is still available.
        </span>
        <Link href="/pos" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
          Continue to POS <ExternalLink className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}

function WifiIcon() {
  return <span className="mb-4 block text-primary"><svg aria-hidden="true" className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13a10 10 0 0 1 14 0" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M12 20h.01" /></svg></span>;
}