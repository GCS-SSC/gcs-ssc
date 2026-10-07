import { sql, type Kysely } from 'kysely'
import type { Database } from '../../../shared/types/database'

// Clean-cutover baseline: enums. Edit this subject directly.

/** Installs the current up definitions for this subject on a fresh database. */
export const up = async (db: Kysely<Database>): Promise<void> => {
  await sql`DO $baseline$ BEGIN
CREATE EXTENSION IF NOT EXISTS citext;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE "Checklist_Answer" AS ENUM ('pass', 'fail', 'not_applicable');

CREATE TYPE "Checklist_Result" AS ENUM ('pass', 'pass_with_considerations', 'fail');

CREATE TYPE "Language_Preference" AS ENUM ('eng', 'fra');

CREATE TYPE "Monitor_Action_Type" AS ENUM ('amendment', 'mandatoryaction', 'suggestedaction', 'none');

CREATE TYPE "Monitor_Responsible_Party" AS ENUM ('applicantrecipient', 'organization', 'joint');

CREATE TYPE "Review_Type" AS ENUM ('checklist', 'assessment');

CREATE TYPE "agreement_applicant_recipient_type" AS ENUM ('guarantor', 'obligant', 'consultant', 'partner');

CREATE TYPE "agreement_type" AS ENUM ('grant', 'nonrepayable', 'repayable', 'partiallyrepayable', 'other');

CREATE TYPE "amended_type" AS ENUM ('articles', 'activities', 'budget', 'duration', 'other');

CREATE TYPE "applicant_recipient_type" AS ENUM ('aboriginalrecipients', 'forprofitorganizations', 'government', 'internationalnongov', 'notforprofitorganizationsandcharities', 'other', 'individualorsoleproprietorships', 'academia');

CREATE TYPE "countries" AS ENUM ('ad', 'ae', 'af', 'ag', 'ai', 'al', 'am', 'ao', 'aq', 'ar', 'as', 'at', 'au', 'aw', 'ax', 'az', 'ba', 'bb', 'bd', 'be', 'bf', 'bg', 'bh', 'bi', 'bj', 'bl', 'bm', 'bn', 'bo', 'bq', 'br', 'bs', 'bt', 'bv', 'bw', 'by', 'bz', 'ca', 'cc', 'cd', 'cf', 'cg', 'ch', 'ci', 'ck', 'cl', 'cm', 'cn', 'co', 'cr', 'cu', 'cv', 'cw', 'cx', 'cy', 'cz', 'de', 'dj', 'dk', 'dm', 'do', 'dz', 'ec', 'ee', 'eg', 'eh', 'er', 'es', 'et', 'fi', 'fj', 'fk', 'fm', 'fo', 'fr', 'ga', 'gb', 'gd', 'ge', 'gf', 'gg', 'gh', 'gi', 'gl', 'gm', 'gn', 'gp', 'gq', 'gr', 'gs', 'gt', 'gu', 'gw', 'gy', 'hk', 'hm', 'hn', 'hr', 'ht', 'hu', 'id', 'ie', 'il', 'im', 'in', 'io', 'iq', 'ir', 'is', 'it', 'je', 'jm', 'jo', 'jp', 'ke', 'kg', 'kh', 'ki', 'km', 'kn', 'kp', 'kr', 'kw', 'ky', 'kz', 'la', 'lb', 'lc', 'li', 'lk', 'lr', 'ls', 'lt', 'lu', 'lv', 'ly', 'ma', 'mc', 'md', 'me', 'mf', 'mg', 'mh', 'mk', 'ml', 'mm', 'mn', 'mo', 'mp', 'mq', 'mr', 'ms', 'mt', 'mu', 'mv', 'mw', 'mx', 'my', 'mz', 'na', 'nc', 'ne', 'nf', 'ng', 'ni', 'nl', 'no', 'np', 'nr', 'nu', 'nz', 'om', 'pa', 'pe', 'pf', 'pg', 'ph', 'pk', 'pl', 'pm', 'pn', 'pr', 'ps', 'pt', 'pw', 'py', 'qa', 're', 'ro', 'rs', 'ru', 'rw', 'sa', 'sb', 'sc', 'sd', 'se', 'sg', 'sh', 'si', 'sj', 'sk', 'sl', 'sm', 'sn', 'so', 'sr', 'ss', 'st', 'sv', 'sx', 'sy', 'sz', 'tc', 'td', 'tf', 'tg', 'th', 'tj', 'tk', 'tl', 'tm', 'tn', 'to', 'tr', 'tt', 'tv', 'tw', 'tz', 'ua', 'ug', 'um', 'us', 'uy', 'uz', 'va', 'vc', 've', 'vg', 'vi', 'vn', 'vu', 'wf', 'ws', 'ye', 'yt', 'za', 'zm', 'zw');

CREATE TYPE "currency_codes" AS ENUM ('all', 'amd', 'ang', 'aoa', 'ars', 'aud', 'awg', 'azn', 'bam', 'bbd', 'bdt', 'bgn', 'bhd', 'bif', 'bnd', 'bob', 'bov', 'brl', 'bsd', 'btn', 'bwp', 'byr', 'bzd', 'cad', 'cdf', 'chf', 'clf', 'clp', 'cny', 'cop', 'crc', 'cuc', 'cve', 'czk', 'djf', 'dkk', 'dop', 'dzd', 'egp', 'ern', 'etb', 'eur', 'fjd', 'gbp', 'gel', 'gip', 'gmd', 'gnf', 'gtq', 'gyd', 'hkd', 'hnl', 'hrk', 'htg', 'huf', 'idr', 'ils', 'inr', 'iqd', 'irr', 'isk', 'jmd', 'jod', 'jpy', 'kes', 'kgs', 'khr', 'kmf', 'krw', 'kwd', 'kyd', 'kzt', 'lak', 'lbp', 'lrd', 'lsl', 'lyd', 'mga', 'mkd', 'mop', 'mur', 'mvr', 'mwk', 'myr', 'nok', 'nzd', 'svc', 'usd', 'xaf', 'xcd', 'xdr', 'xof', 'xpf', 'zar');

CREATE TYPE "decision_type" AS ENUM ('fundingcaseintakeassessment');

CREATE TYPE "follow_up_status" AS ENUM ('open', 'onhold', 'completed', 'cancelled', 'unabletocomplete');

CREATE TYPE "holdback_bases" AS ENUM ('fullagreement', 'finalfiscal');

CREATE TYPE "jurisdiction" AS ENUM ('ab', 'bc', 'mb', 'nb', 'nl', 'ns', 'nt', 'nu', 'on', 'pe', 'qc', 'sk', 'yt');

CREATE TYPE "language_preference" AS ENUM ('eng', 'fra');

CREATE TYPE "payment_type" AS ENUM ('reimbursement', 'advance');

CREATE TYPE "registry_type" AS ENUM ('provincialbusinessnumber', 'federalbusinessnumber', 'craprogramaccountnumber', 'noc', 'naics', 'other');
END $baseline$`.execute(db)
}
