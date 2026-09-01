import { Redirect, Route, Switch, useRoute } from "wouter";
import { ReportsLayout } from "./layout";
import ReportsOverview from "./overview";
import ReportsSales from "./sales";
import ReportsProducts from "./products";
import ReportsInventory from "./inventory";
import ReportsCash from "./cash";
import ReportsPurchasing from "./purchasing";
import ReportsStores from "./stores";
import ReportsEmployees from "./employees";
import ReportsAudit from "./audit";

export default function ReportsRouter() {
  const [match] = useRoute("/reports/:section?");

  if (!match) return null;

  return (
    <ReportsLayout>
      <Switch>
        <Route path="/reports" component={() => <Redirect to="/reports/overview" />} />
        <Route path="/reports/overview" component={ReportsOverview} />
        <Route path="/reports/sales" component={ReportsSales} />
        <Route path="/reports/products" component={ReportsProducts} />
        <Route path="/reports/inventory" component={ReportsInventory} />
        <Route path="/reports/cash" component={ReportsCash} />
        <Route path="/reports/purchasing" component={ReportsPurchasing} />
        <Route path="/reports/stores" component={ReportsStores} />
        <Route path="/reports/employees" component={ReportsEmployees} />
        <Route path="/reports/audit" component={ReportsAudit} />
        <Route component={() => <Redirect to="/reports/overview" />} />
      </Switch>
    </ReportsLayout>
  );
}
