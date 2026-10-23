import type { Language } from "@/i18n/messages";
import type { LedgerSnapshot } from "@/features/ledger/ledger.types";
import { formatLedgerPHP } from "@/features/ledger/ledger.rules";
import {
  preparationMissing,
  preparationValuesSchema,
} from "../preparation.schema";
import { preparationMessages } from "./preparation-messages";
import styles from "@/features/ledger/components/records.module.css";

export function PreparationEvidence({
  snapshot,
  language,
}: {
  snapshot: LedgerSnapshot;
  language: Language;
}) {
  const t = preparationMessages[language];
  const parsed = preparationValuesSchema.safeParse(
    snapshot.preparation?.profile,
  );
  if (!parsed.success) return null;
  const profile = parsed.data;
  const missing = preparationMissing(profile);
  const labels: Record<string, string> = {
    registration: t.registrationMissing,
    taxTreatment: t.treatmentMissing,
    evidence: t.evidenceMissing,
    priorIncomeCentavos: t.priorIncomeMissing,
    priorTaxPaymentsCentavos: t.priorTaxMissing,
    otherCreditsCentavos: t.creditsMissing,
    coverage: t.coverageMissing,
    verifiedRules: t.verifiedRules,
    practitionerReview: t.practitionerReview,
  };
  const amount = (value: string | null) =>
    value === null ? t.unknown : formatLedgerPHP(value);
  return (
    <section className={styles.card}>
      <h3>{t.profileStep}</h3>
      <p>{t.unchanged}</p>
      <dl className={styles.details}>
        <div>
          <dt>{t.year}</dt>
          <dd>{profile.year}</dd>
        </div>
        <div>
          <dt>{t.registration}</dt>
          <dd>
            {profile.registration === "registered"
              ? t.registered
              : profile.registration === "not_registered"
                ? t.notRegistered
                : t.unknown}
          </dd>
        </div>
        <div>
          <dt>{t.treatment}</dt>
          <dd>
            {profile.taxTreatment === "eight_percent"
              ? t.eightPercent
              : profile.taxTreatment === "graduated"
                ? t.graduated
                : profile.taxTreatment === "other"
                  ? t.other
                  : t.unknown}
          </dd>
        </div>
        <div>
          <dt>{t.evidence}</dt>
          <dd>{profile.evidence || t.unknown}</dd>
        </div>
        <div>
          <dt>{t.coverage}</dt>
          <dd>
            {profile.coverage === "complete"
              ? t.complete
              : profile.coverage === "partial"
                ? t.partial
                : t.unknown}
          </dd>
        </div>
        <div>
          <dt>{t.priorIncome}</dt>
          <dd>{amount(profile.priorIncomeCentavos)}</dd>
        </div>
        <div>
          <dt>{t.priorTax}</dt>
          <dd>{amount(profile.priorTaxPaymentsCentavos)}</dd>
        </div>
        <div>
          <dt>{t.credits}</dt>
          <dd>{amount(profile.otherCreditsCentavos)}</dd>
        </div>
      </dl>
      {profile.notes ? (
        <p>
          {t.notes}: {profile.notes}
        </p>
      ) : null}
      <p>{t.amountsHelp}</p>
      <p>{t.blocked}</p>
      <h3>{t.unknownItems}</h3>
      <ul className={styles.checklist}>
        {missing.map((item) => (
          <li key={item}>{labels[item]}</li>
        ))}
      </ul>
      <h3>{t.nextSteps}</h3>
      <ol className={styles.checklist}>
        <li>{t.stepRecords}</li>
        <li>{t.stepEvidence}</li>
        <li>{t.stepReview}</li>
      </ol>
    </section>
  );
}
