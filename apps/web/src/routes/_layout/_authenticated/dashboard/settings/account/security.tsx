import { createFileRoute } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { TwoFactorSettings } from "@/components/account/two-factor-settings";
import PageTitle from "@/components/page-title";

export const Route = createFileRoute(
  "/_layout/_authenticated/dashboard/settings/account/security",
)({
  component: RouteComponent,
});

function RouteComponent() {
  const { t } = useTranslation();

  return (
    <>
      <PageTitle title={t("settings:securityPage.pageTitle")} />
      <div className="max-w-4xl mx-auto space-y-8">
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {t("settings:securityPage.title")}
          </h1>
          <p className="text-muted-foreground">
            {t("settings:securityPage.subtitle")}
          </p>
        </div>

        <TwoFactorSettings />
      </div>
    </>
  );
}
