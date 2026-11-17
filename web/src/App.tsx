import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import AppLayout from "@cloudscape-design/components/app-layout";
import TopNavigation from "@cloudscape-design/components/top-navigation";
import SideNavigation, { type SideNavigationProps } from "@cloudscape-design/components/side-navigation";
import BreadcrumbGroup, { type BreadcrumbGroupProps } from "@cloudscape-design/components/breadcrumb-group";
import Flashbar from "@cloudscape-design/components/flashbar";
import Badge from "@cloudscape-design/components/badge";
import { api } from "./api";
import { FlashProvider, useFlash } from "./common";
import { SERVICES } from "./services";
import Overview from "./pages/Overview";
import S3Routes, { S3_NAV } from "./pages/s3/routes";
import DynamoRoutes, { DDB_NAV } from "./pages/dynamodb/routes";
import Ec2Routes, { EC2_NAV } from "./pages/ec2/routes";
import RdsRoutes, { RDS_NAV } from "./pages/rds/routes";
import GlueRoutes, { GLUE_NAV } from "./pages/glue/routes";
import EcsRoutes, { ECS_NAV } from "./pages/ecs/routes";
import EcrRoutes, { ECR_NAV } from "./pages/ecr/routes";
import EksRoutes, { EKS_NAV } from "./pages/eks/routes";
import LambdaRoutes, { LAMBDA_NAV } from "./pages/lambda/routes";
import AthenaRoutes, { ATHENA_NAV } from "./pages/athena/routes";

// Pages set their breadcrumbs through this context.
type Crumb = BreadcrumbGroupProps.Item;
const CrumbCtx = createContext<(c: Crumb[]) => void>(() => {});
export function useCrumbs(items: Crumb[]) {
  const set = useContext(CrumbCtx);
  const key = JSON.stringify(items);
  useEffect(() => { set(items); }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

function sideNavFor(path: string): { header: SideNavigationProps.Header; items: SideNavigationProps.Item[] } {
  if (path.startsWith("/s3")) return S3_NAV;
  if (path.startsWith("/dynamodb")) return DDB_NAV;
  if (path.startsWith("/ec2")) return EC2_NAV;
  if (path.startsWith("/rds")) return RDS_NAV;
  if (path.startsWith("/glue")) return GLUE_NAV;
  if (path.startsWith("/ecs")) return ECS_NAV;
  if (path.startsWith("/ecr")) return ECR_NAV;
  if (path.startsWith("/eks")) return EKS_NAV;
  if (path.startsWith("/lambda")) return LAMBDA_NAV;
  if (path.startsWith("/athena")) return ATHENA_NAV;
  return {
    header: { text: "Emulator Console", href: "#/" },
    items: [
      { type: "link", text: "Overview", href: "#/" },
      { type: "divider" },
      ...groupedServices(),
    ],
  };
}
function groupedServices(): SideNavigationProps.Item[] {
  const groups = [...new Set(SERVICES.map(s => s.group))];
  return groups.map(g => ({
    type: "section",
    text: g,
    items: SERVICES.filter(s => s.group === g).map(s => ({
      type: "link", text: s.name, href: s.href,
      info: s.legacy ? <Badge color="grey">basic</Badge> : undefined,
    })),
  }));
}

function Shell() {
  const loc = useLocation();
  const { items: flashes } = useFlash();
  const [crumbs, setCrumbs] = useState<Crumb[]>([]);
  const [health, setHealth] = useState<{ up: boolean; endpoint?: string } | null>(null);
  const [navOpen, setNavOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    const tick = () => api.health().then(h => alive && setHealth(h)).catch(() => alive && setHealth({ up: false }));
    tick();
    const t = setInterval(tick, 5000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  const nav = sideNavFor(loc.pathname);
  const activeHref = "#" + loc.pathname;

  return (
    <CrumbCtx.Provider value={setCrumbs}>
      <div id="top-nav" style={{ position: "sticky", top: 0, zIndex: 1002 }}>
        <TopNavigation
          identity={{ href: "#/", title: "Emulator Console" }}
          utilities={[
            {
              type: "menu-dropdown",
              text: "Services",
              iconName: "grid-view",
              items: [...new Set(SERVICES.map(s => s.group))].map(g => ({
                id: g, text: g,
                items: SERVICES.filter(s => s.group === g).map(s => ({ id: s.id, text: s.name, href: s.href })),
              })),
              onItemFollow: () => {},
            },
            {
              type: "button",
              text: health == null ? "Checking emulator…" : health.up ? "Emulator running" : "Emulator not running",
              iconName: health?.up ? "status-positive" : "status-negative",
              title: health?.endpoint,
            },
            { type: "button", text: "us-east-1 · 000000000000", iconName: "user-profile" },
          ]}
        />
      </div>
      <AppLayout
        headerSelector="#top-nav"
        navigationOpen={navOpen}
        onNavigationChange={e => setNavOpen(e.detail.open)}
        navigation={<SideNavigation header={nav.header} items={nav.items} activeHref={activeHref} />}
        breadcrumbs={crumbs.length ? <BreadcrumbGroup items={crumbs} ariaLabel="Breadcrumbs" /> : undefined}
        notifications={<Flashbar items={flashes} stackItems={flashes.length > 2} />}
        toolsHide
        contentType="default"
        content={
          <Routes>
            <Route path="/" element={<Overview />} />
            <Route path="/s3/*" element={<S3Routes />} />
            <Route path="/dynamodb/*" element={<DynamoRoutes />} />
            <Route path="/ec2/*" element={<Ec2Routes />} />
            <Route path="/rds/*" element={<RdsRoutes />} />
            <Route path="/glue/*" element={<GlueRoutes />} />
            <Route path="/ecs/*" element={<EcsRoutes />} />
            <Route path="/ecr/*" element={<EcrRoutes />} />
            <Route path="/eks/*" element={<EksRoutes />} />
            <Route path="/lambda/*" element={<LambdaRoutes />} />
            <Route path="/athena/*" element={<AthenaRoutes />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        }
      />
    </CrumbCtx.Provider>
  );
}

export default function App() {
  return (
    <FlashProvider>
      <Shell />
    </FlashProvider>
  );
}

export function Page({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
