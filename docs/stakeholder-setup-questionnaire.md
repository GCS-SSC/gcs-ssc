# Setting up GCS–SSC: stakeholder information workbook

Use this workbook to describe how your organization delivers grants and contributions and to collect the materials needed to set up the application. You do not need prior experience with GCS–SSC or an existing GCS configuration.

Complete the agency definitions in section 2, the program tables in section 3, and the explicit stream selections in section 4 before using the detailed process/material worksheets in sections 5–14. Bring your current policies, spreadsheets, forms and process maps. If a process or template does not yet exist, record **Not yet defined**, the person who can help define it, and a target date. You are not being asked to authorize setup or sign off on the project. Operational approval and routing processes still need to be described so the application can support the work.

### How the pieces fit together

| Term | What it means | Example |
| --- | --- | --- |
| Agency | The organization administering funding; holds shared definitions such as fiscal years and recipient categories. | Community Development Agency |
| Program | A funding program with its own purpose, terms and conditions, dates and budget. | Community Capacity Program |
| Stream | A funding route within a program, with its own eligibility, financial rules and processes. | Rural Projects |
| Funding opportunity | A particular call for applications, with opening/closing dates and one or more streams in the same program. | Rural Projects — Spring 2027 call |
| Applicant / recipient (also called a proponent) | The person or organization applying for or receiving funding. | A local nonprofit |
| Agreement | The funding arrangement with a recipient, including activities, budget and obligations. | A two-year community service project |
| Assessment | A structured review, often with scores, ratings or calculated outcomes. | Recipient risk assessment |
| Checklist | A set of checks with completion/pass/fail rules and evidence. | Application completeness checklist |
| Recommendation | A proposed decision with rationale, conditions and supporting information. | Recommend CAD 75,000 with reporting conditions |
| Approval / routing slip | The sequence of reviews, certifications and decisions required for a piece of work. | Officer → finance reviewer → program manager |

### How to fill it in

Example rows are fictional illustrations, not defaults or recommended policy. Leave them as a guide and enter your information in the blank rows. Add as many rows as needed. In profile tables, use the response columns. For long policies or large lists, give a file/link and the relevant page, sheet or section instead of copying everything.

Use business names or your own short references to connect tables; no GCS record numbers are needed. For example, label the Rural Projects stream **S1** and its risk assessment **A1**, then use those references in workflow tables. Supply English and French text in the columns provided. Use YYYY-MM-DD dates, currencies with amounts, and a % sign plus a calculation basis for percentages.

Mark an unused feature **Not applicable** and explain briefly. Record unresolved items in section 14. Do not enter passwords, access tokens or identifiable applicant case files; provide blank or anonymized samples.

### Suggested completion order

| Stage | Sections | Who can help |
| --- | --- | --- |
| Establish scope and all agency definitions (A01–A24) | 1–2 | Coordinator, agency administrator, finance |
| Define programs (P01–P06), select/configure streams (S01–S20), then calls | 3–5 | Program delivery and policy teams |
| Define money rules and work steps | 6–7 | Finance and delivery staff |
| Collect forms and decision materials | 8–12 | Assessors, officers, reviewers and document owners |
| Prepare operational handoff | 13–14 | System contacts, records team, training/support leads |

## 1. Scope, people and available material

| Detail | Example only | Your response |
| --- | --- | --- |
| Workbook version | 0.4 |  |
| Last updated | 2026-10-21 |  |
| Setup coordinator | Sam Lee |  |
| Coordinator email | sam.lee@example.org |  |
| Target first-use date | 2027-04-01 |  |
| What must work for the first release? | Application intake, risk review, funding recommendation, agreement preparation and first payment. |  |
| What can follow later? | Historical closed agreements and optional external integrations. |  |

### Organizations, programs and streams in scope

One row per stream; repeat the agency and program names where needed. Use “No streams defined yet” if the program structure is still being worked out.

| Agency | Program | Stream / short reference | First intake date |
| --- | --- | --- | --- |
| **Example — Community Development Agency** | Community Capacity Program | Rural Projects / S1 | 2027-04-15 |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### People to consult

Include delivery, finance, official languages, records/privacy, IT and support contacts. These are working contacts, not a permission or signing-authority matrix.

| Area | Name / team | Email | Information they can provide |
| --- | --- | --- | --- |
| **Example — Finance** | Morgan Chen | morgan.chen@example.org | Fiscal years, budgets, coding and payment processes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### Current material available

This means documents you use today, whether on paper, in Word/Excel or in another system. It does not assume prior use of GCS. List missing material too.

| Material | Available / not yet defined / N/A | File or link / version | Contact | Changes needed |
| --- | --- | --- | --- | --- |
| **Example — Recipient risk form** | Available | recipient-risk-v3.xlsx | Policy team | Add French guidance |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

## 2. Agency setup — every agency navigation section

Complete once per agency. The headings below follow all 24 agency sections. Each has its own collection table; do not treat any section as automatically populated. Write “Not applicable” or “Not yet defined” in a blank row when appropriate. Business references such as **HB1**, **CF1** or **RS1** are names you assign in this workbook, not system IDs.

**Define at agency level, then select at stream level:** agency definitions are shared within that agency. Creating a definition does not make it selected in every stream. Programs supply their own budgets and results; streams explicitly select the agency definitions and program budgets they need. Some agency definitions are used inside review/recommendation sets and workflows rather than selected directly on a stream.

### Definition-to-selection map

Use this map when handing the workbook to the person doing configuration. Each reference below points to a dedicated table, not an assumed default.

| Define first | Then select / connect it here |
| --- | --- |
| A03 Agreement types | S09 Agreement subtypes |
| A05 Approval templates | Review/recommendation/data collection approval links and workflow steps in A11, A21, A22 and A24 |
| A06 Attachment types | Required application/form documents in sections 5 and 12; no separate stream attachment-type tab |
| A07 Charts of accounts | S10 Charts of accounts |
| A08 Commitment types | S11 Commitment types |
| A09 Cost categories and lines | S05 Cost line items and stream cost sharing |
| A10 Custom fields and options | S13 Field sections, required flags and display order |
| A11 Data collections | A24 Workflow data collection steps |
| A12 Document templates | S18 Document templates |
| A13 Agency extensions | S20 Stream extension enablement/configuration where supported |
| A14 Fiscal years | P05 Program budgets → S03 Stream allocations |
| A15 Funding types and subtypes | S06 Funding subtype selections |
| A16 Holdback bases | S02 Holdback selections |
| A17 Monitor types | S12 Monitor selections |
| A19 Proponent subtypes | S04 Eligible recipients |
| A20 Receivable types | Recovery procedures in section 6; no separate stream receivable-type tab |
| A21 Recommendation setups | A24 Workflow recommendation-set steps |
| A22 Review setups | S17 Review selections and A24 Workflow review-set steps |
| A23 Statuses | A24 Workflow status rules and applicable record lifecycle requirements |
| A24 Workflows | S19 Workflow selections |

### A01. General

| Text | English example | French example | Your English text | Your French text |
| --- | --- | --- | --- | --- |
| Official name | Community Development Agency | Agence de développement communautaire |  |  |
| Abbreviation | CDA | ADC |  |  |

| Detail | Example only | Your response |
| --- | --- | --- |
| Agency reference | AG1 |  |
| Agency contact | Alex Martin |  |
| GWCOA number | 123; obtain the actual government-wide chart of accounts number from finance. |  |
| Agency financial system identifier | 1001; obtain the actual agency identifier from finance. |  |
| Financial system name | Departmental finance system |  |
| Active at first use? | Yes |  |

### A02. Address types

| Reference | Name EN | Name FR | What this address is used for |
| --- | --- | --- | --- |
| **Example — AD1** | Mailing | Postale | Correspondence sent to the recipient |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A03. Agreement types

One row per agency type. Identify its underlying arrangement: grant, non-repayable, repayable, partially repayable or other. Streams select these entries under the screen called Agreement subtypes; they do not create a second name for the selected entry.

| Reference | Name EN | Name FR | Underlying arrangement | Policy / definition |
| --- | --- | --- | --- | --- |
| **Example — AT1** | Community contribution | Contribution communautaire | Non-repayable | Project contribution with no scheduled repayment; terms.pdf §3 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A04. Approval behalf

Describe the designations used when someone acts on behalf of another person.

| Reference | Name EN | Name FR | Actual decision-maker identity required? |
| --- | --- | --- | --- |
| **Example — AB1** | Acting | Intérim | Yes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A05. Approval templates

Define the template and its steps here. Collect the existing approval/routing slips and detailed return paths in section 10. These are operational approval definitions, not authorization to carry out setup.

| Reference | Name EN | Name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — AP1** | Funding decision | Décision de financement | Review and decide on proposed funding | Examiner le financement proposé et rendre une décision |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

One row per step in each approval template. A default user or group is optional; give a business name/contact rather than a login ID.

| Template / step order | Step name EN / FR | Description EN / FR | Approver title | Default person or group / capture group details? |
| --- | --- | --- | --- | --- |
| **Example — AP1 / 1** | Finance review / Examen financier | Verify funds / Vérifier les fonds | Finance reviewer | Finance team; capture group details: Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

One row per certification within a step. Include bilingual descriptions and the exact bilingual statement the reviewer must confirm.

| Template / step / certification order | Name EN / FR | Description EN / FR | Certification text EN / FR | Optional? |
| --- | --- | --- | --- | --- |
| **Example — AP1 / 1 / 1** | Budget check / Vérification du budget | Funding verification / Vérification du financement | Funds are available / Les fonds sont disponibles | No |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A06. Attachment types

These classify uploaded files. They are distinct from the document templates used to generate a file. Required attachments for a particular application or form are identified in sections 5 and 12.

| Reference | Name EN | Name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — ATT1** | Financial statements | États financiers | Recipient annual financial statements | États financiers annuels du bénéficiaire |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A07. Charts of accounts

Finance defines each coding set by fiscal year, currency and purpose (commitment or payment). A payment set may reference its related commitment set. Streams select these sets in S10.

| Coding reference / name | Fiscal year from A14 | Currency | Commitment or payment? | Related commitment set |
| --- | --- | --- | --- | --- |
| **Example — FIN1 / Community projects** | 2027–2028 | CAD | Commitment | Not applicable |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

One row per accounting dimension within a coding set. Examples of dimensions are cost centre, fund and project.

| Coding reference | Dimension label EN | Dimension label FR | Code / value |
| --- | --- | --- | --- |
| **Example — FIN1** | Cost centre | Centre de coûts | 4100 |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A08. Commitment types

A commitment reserves funding. Define the labels staff will choose; stream applicability is recorded in S11.

| Reference | Name EN | Name FR | Business meaning / procedure |
| --- | --- | --- | --- |
| **Example — CT1** | Project commitment | Engagement de projet | Funding reserved for a project; commitment-guide.docx |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A09. Cost categories

| Reference | Category name EN | Category name FR | Active? |
| --- | --- | --- | --- |
| **Example — CC1** | Travel | Déplacements | Yes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

Define each cost line within its category. Amounts may be entered manually, calculated as a percentage of one source category, or calculated as a percentage of all other applicable costs. Identify the intended calculation base precisely; the setup team will map it to the supported calculation. Stream cost-sharing rates are separate (S05).

| Line reference / category | Line name EN / FR | Active? | Calculation: manual / source category / all other | Default % / source category / allow % override? |
| --- | --- | --- | --- | --- |
| **Example — CL1 / CC1** | Accommodation / Hébergement | Yes | Manual | Not applicable; amount entered manually |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A10. Custom fields

Define extra agreement fields once at agency level. The supported field kinds are text, number and selection from a list (called relational in the application). Stream sections, required flags and display order are recorded in S13.

| Field reference | Name EN | Name FR | Kind | Text: single-line / multiline; selection: single / multiple | Distinguishes workflow paths? |
| --- | --- | --- | --- | --- | --- |
| **Example — CF1** | Service region | Région desservie | Selection from list | Single selection | Yes |
|   |   |   |   |   |   |
|   |   |   |   |   |   |
|   |   |   |   |   |   |

For selection fields, supply every option and any bilingual grouping labels. Workflow-path selection is a field-level setting, not an option-level setting; the setup team will confirm available branching rules.

| Field / option reference | Option EN / FR | Group label EN / FR, if any | Display order / active? |
| --- | --- | --- | --- |
| **Example — CF1 / OPT1** | North / Nord | Service areas / Zones desservies | 1 / Yes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A11. Data collections

These are agency-owned questionnaires used to collect information during work. They are separate from scored assessments and pass/fail checklists. Collect question-level detail and sample forms in section 12.

| Reference | Name EN / FR | Description EN / FR | Approval template from A05, if any | Current form / contact |
| --- | --- | --- | --- | --- |
| **Example — DC1** | Final report / Rapport final | Project delivery results / Résultats du projet | AP2 final-report review; define AP2 in A05 | final-report.docx / Program team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A12. Document templates

Supply editable source files and bilingual names/descriptions. Supported targets are Agreement, Agreement Closeout and Amendment; source formats are DOCX or HTML, with native-format and/or PDF outputs. Identify the record the document is generated for. Collect field mappings and numbering in section 12; select templates for each stream in S18.

| Reference | Name EN / FR | Description EN / FR | Record / target | Source format / allowed outputs |
| --- | --- | --- | --- | --- |
| **Example — DT1** | Contribution agreement / Entente de contribution | Project funding terms / Modalités du financement | Agreement | DOCX / DOCX and PDF |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

| Template reference | English source file / version | French source file / version | Active? | Contact |
| --- | --- | --- | --- | --- |
| **Example — DT1** | agreement-en-v2.docx | agreement-fr-v2.docx | Yes | Program team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A13. Extensions

An extension adds a capability such as an application portal connection or a storage provider. Identify what the agency needs; technical staff will confirm which installed extensions support it. Do not put credential values in this workbook.

| Extension / capability | Enable for agency? | Purpose | Configuration material / contact | Needed at first use? |
| --- | --- | --- | --- | --- |
| **Example — Portal connector** | Yes | Receive submitted applications | portal-map.xlsx / Portal team | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Select one agency storage provider for new attachments/documents. List other providers that must remain enabled to read existing files.

| Storage provider | Selected for new files? | Needed for existing files? | Storage requirements / contact |
| --- | --- | --- | --- |
| **Example — Agency-managed S3 storage** | Yes | Yes | Storage location and lifecycle requirements / IT operations |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A14. Fiscal years

| Fiscal year label | Year value | Start date | End date | Journal voucher entry open? |
| --- | --- | --- | --- | --- |
| **Example — 2027–2028** | 2027 | 2027-04-01 | 2028-03-31 | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A15. Funding types

These describe funding sources, not agreement types or the program budget. For each type, state whether it counts toward stacking (combined funding limits) and cost sharing.

| Type reference | Name EN | Name FR | Included in stacking? | Included in cost sharing? / active? |
| --- | --- | --- | --- | --- |
| **Example — FT1** | Other government funding | Autre financement public | Yes | Yes / Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Define subtypes under each funding type. Streams choose individual subtypes in S06; the stacking/cost-sharing flags come from their parent type.

| Type reference | Subtype reference | Subtype name EN | Subtype name FR | Active? |
| --- | --- | --- | --- | --- |
| **Example — FT1** | FS1 | Provincial funding | Financement provincial | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A16. Holdback bases

A holdback is money retained until conditions are met. Define the agency basis as full agreement or final fiscal year, with a language-independent business code. Select bases in S02; provide the actual rate and release policy in section 6.

| Reference / business code | Name EN | Name FR | Basis: full agreement / final fiscal year |
| --- | --- | --- | --- |
| **Example — HB1 / FULL** | Full agreement | Entente complète | Full agreement |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A17. Monitor types

A monitor is a monitoring activity or record. Identify types that may also be used when monitoring receivables.

| Reference | Name EN | Name FR | Eligible for receivable monitoring? |
| --- | --- | --- | --- |
| **Example — MT1** | Financial monitoring | Suivi financier | Yes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A18. Programs

This is the agency’s list of programs. Complete section 3 for each listed program, then section 4 for every stream under that program.

| Program reference | Program name EN | Program name FR | Contact | Needed at first use? |
| --- | --- | --- | --- | --- |
| **Example — P1** | Community Capacity Program | Programme de renforcement des capacités communautaires | Alex Martin | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A19. Proponent subtypes

A proponent is an applicant or recipient. The broad types are Indigenous recipients, for-profit organizations, government, international nongovernmental organizations, not-for-profit organizations and charities, individuals/sole proprietorships, academia, and other. Define the more specific agency subtypes and their descriptions here. Streams select eligible subtypes in S04.

| Reference / broad type | Subtype name EN | Subtype name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — PS1 / Not-for-profit organizations and charities** | Community nonprofit | Organisme communautaire sans but lucratif | Nonprofit delivering local services | Organisme sans but lucratif offrant des services locaux |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A20. Receivable types

A receivable is money owed back to the agency. Each type identifies either an advance-related or claim-related source, not both. Provide bilingual descriptions and indicate whether a monitor is required.

| Reference | Name EN / FR | Description EN / FR | Advance- or claim-related? | Monitor required? |
| --- | --- | --- | --- | --- |
| **Example — REC1** | Unused advance / Avance inutilisée | Recovery of unspent advance / Recouvrement d’une avance inutilisée | Advance | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A21. Recommendation setups

A recommendation setup groups one or more recommendation forms in an execution order. Define both the set and its members. Detailed recommendation questions, outcomes and source templates belong in section 11. Sets are used inside agency workflows (A24); they are not a separate direct stream selection.

| Set reference | Name EN / FR | Description EN / FR | Final approval template, if any |
| --- | --- | --- | --- |
| **Example — NS1** | Funding recommendation set / Ensemble de recommandations de financement | Proposal for a funding decision / Proposition de décision de financement | AP1 |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

| Set / member reference | Order | Recommendation form name EN / FR | Approval template, if any | Stop if not recommended? |
| --- | --- | --- | --- | --- |
| **Example — NS1 / N1** | 1 | Funding recommendation / Recommandation de financement | None | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

One row per recommendation form definition. Use the member reference from the preceding table and collect its questions/outcomes in section 11.

| Member reference | Name EN | Name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — N1** | Funding recommendation | Recommandation de financement | Proposed funding, rationale and conditions | Financement proposé, justification et conditions |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### A22. Review setups

A review setup (review set) groups assessments and checklists for a particular kind of record. Define the set, then list its members. Question-level assessment and checklist detail is collected in sections 8–9. Streams select published sets in S17.

| Set reference | Name EN / FR | Description EN / FR | Record being reviewed | Order / sequential? / direct review? |
| --- | --- | --- | --- | --- |
| **Example — RS1** | Intake review / Examen de la demande | Eligibility and recipient risk / Admissibilité et risque du bénéficiaire | Application intake | 1 / Yes / Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Direct review means the set can be started as a review of the record rather than only as a step in a workflow. Give a final approval template, if any, in the following table.

| Set reference | Set final approval template, if any | Member reference / type | Member order / default team | Member approval template, if any |
| --- | --- | --- | --- | --- |
| **Example — RS1** | None | C1 / Checklist | 1 / Intake team | None |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

| Set / member | Failure rule / threshold | Allow custom outcomes? | Allow alignment? | Allow additional reviewers? |
| --- | --- | --- | --- | --- |
| **Example — RS1 / C1** | Stop if mandatory checklist item fails | Not applicable for this checklist | Not applicable | No |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

For assessments, explain the threshold and what “failure” means in the assessment guide. If alignment or additional reviewer choices are unfamiliar, mark Not yet defined and ask the setup team to demonstrate them. Provide exact names and descriptions of each assessment/checklist in sections 8–9.

### A23. Statuses

List business statuses and their bilingual labels. Read-only and terminal are separate choices and cannot both be Yes for the same status. The setup team will identify protected system statuses and map requested transitions to the supported behavior.

| Reference | Name EN | Name FR | Read-only? | Terminal? |
| --- | --- | --- | --- | --- |
| **Example — ST1** | In review | En examen | No | No |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

| Status reference | Colour / icon preference | Used for which records? | Next / return status rules |
| --- | --- | --- | --- |
| **Example — ST1** | Blue / magnifying glass; setup team to map appearance | Funding opportunity | Open when ready to accept applications |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### A24. Workflows

Define the agency process once, referencing the agency review sets, recommendation sets, data collections and approval templates above. Link the resulting published workflow to streams in S19. Section 7 collects the broader business handoffs and exception process.

| Workflow reference | Name EN / FR | Description EN / FR | Record / target | Purpose: standard / approval submission / risk rating |
| --- | --- | --- | --- | --- |
| **Example — W1** | Initial funding / Financement initial | Review proposed funding / Examiner le financement proposé | Agreement | Approval submission |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

| Workflow reference | Allowed starting statuses | Status on cancellation | Status on execution failure | Retry allowed? / risk rating required? |
| --- | --- | --- | --- | --- |
| **Example — W1** | Draft | Draft | Needs attention; define status in A23 | Yes / No |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

One row per workflow step. Reference the definitions above, not a second copy of the same form. Provide the exact responsible-team rules and branch conditions with the process map.

| Workflow / step | Step kind | Agency definition reference | Responsible team / condition | Next step / branch |
| --- | --- | --- | --- | --- |
| **Example — W1 / 1** | Review set | RS2 agreement review; define RS2 in A22 | Program officer; all agreements | Then N1 through recommendation set NS1 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Record status changes and risk-rating behavior for each step. Use statuses defined in A23; leave a status change as “None” when the step should preserve the current status. “Risk rating required” at workflow level applies only to a Risk rating workflow purpose.

| Workflow / step | Status when step starts | Status on success | Status on failure | Sets risk rating? / assessment member supplying rating |
| --- | --- | --- | --- | --- |
| **Example — W1 / 1** | None | None | None | No / Not applicable |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Step kinds include review set, recommendation set, data collection and approval. Each referenced definition must exist in this agency; targets and workflow purpose must be compatible. Technical staff will check and publish completed definitions before stream selection; stakeholders need only identify the intended process and source material.

## 3. Program setup — every program navigation section

Copy this section for each program listed in A18. Agency reference: ______  Program reference: ______. Use the same references across all tables. Program configuration has six sections; agency catalogs remain at agency level and are selected further down at stream level.

### P01. General

| Text | English example | French example | Your English text | Your French text |
| --- | --- | --- | --- | --- |
| Name | Community Capacity Program | Programme de renforcement des capacités communautaires |  |  |
| Abbreviation | CCP | PRCC |  |  |
| Description | Funds nonprofit community service projects. | Finance des projets communautaires sans but lucratif. |  |  |
| Purpose | Improve access to essential local services. | Améliorer l’accès aux services locaux essentiels. |  |  |

| Detail | Example only | Your response |
| --- | --- | --- |
| Owning agency | AG1 / Community Development Agency |  |
| Program contact | Alex Martin |  |
| Start date | 2027-04-01 |  |
| End date | 2030-03-31 |  |
| Active at first use? | Yes |  |
| Terms and conditions English URL | https://example.org/en/ccp/terms |  |
| Terms and conditions French URL | https://example.org/fr/prcc/modalites |  |
| Terms version / effective date | Version 3 / 2027-04-01 |  |

### P02. Streams

Create a row for every stream under this program, then complete all of section 4 for each stream. A parent stream, if used, belongs to this program; the relationship does not imply copied configuration.

| Stream reference | Name EN | Name FR | Parent stream, if any | Active at first use? |
| --- | --- | --- | --- | --- |
| **Example — S1** | Rural Projects | Projets ruraux | None | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### P03. Outcomes

| Outcome reference | Name EN | Name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — OUT1** | Stronger local services | Services locaux renforcés | More people can obtain local services | Davantage de personnes peuvent obtenir des services locaux |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### P04. Objectives

| Objective reference | Objective EN | Objective FR |
| --- | --- | --- |
| **Example — OBJ1** | Increase access to local services | Accroître l’accès aux services locaux |
|   |   |   |
|   |   |   |
|   |   |   |

### P05. Budgets

Select an agency fiscal year from A14. One row per fiscal year/currency budget. Explain permitted overcommitment as a percentage of additional commitments above the budget; setup staff will convert this to the system representation. Streams allocate from these specific budget rows in S03.

| Budget reference / fiscal year | Currency | Total program budget | Overcommitment % / intended meaning | Source / finance contact |
| --- | --- | --- | --- | --- |
| **Example — PB1 / 2027–2028** | CAD | 5,000,000.00 | 0% additional commitments | budget-plan.xlsx / Morgan |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### P06. Performance indicators

Each indicator must identify its program outcome from P03 and have bilingual names/descriptions. Targets and reporting frequency are business requirements to map, not fields on the indicator definition; capture them separately below.

| Indicator / outcome reference | Name EN | Name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — PI1 / OUT1** | People served | Personnes desservies | People accessing funded services | Personnes ayant accès aux services financés |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

| Indicator reference | Target / unit | Reporting frequency | Contact / source framework |
| --- | --- | --- | --- |
| **Example — PI1** | 2,000 people per year | Quarterly | Jordan / results-framework.xlsx |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

## 4. Stream setup — selections and stream-owned rules

Copy this entire section for each stream in P02. Agency reference: ______  Program reference: ______  Stream reference: ______. The tables below cover all 20 stream navigation sections. Each selection names an existing definition from this workbook; creating the agency or program entry alone is not a stream selection. Mark excluded items No or Not applicable explicitly.

### S01. General

| Text | English example | French example | Your English text | Your French text |
| --- | --- | --- | --- | --- |
| Name | Rural Projects | Projets ruraux |  |  |
| Abbreviation | RP | PR |  |  |
| Description | Funds local service projects in rural areas. | Finance des projets de services locaux en milieu rural. |  |  |
| Objective | Expand rural access to essential services. | Élargir l’accès aux services essentiels en milieu rural. |  |  |

| Detail | Example only | Your response |
| --- | --- | --- |
| Parent stream | None |  |
| Stream contact | Alex Martin |  |
| Active at first use? | Yes |  |
| Require consistent proponent subtype? | Yes; a recipient uses the same eligible subtype across its agreements in this stream. |  |
| Allow further distribution of funding? | No; recipients deliver activities directly. |  |
| Redistribution conditions, if allowed | Not applicable; otherwise describe eligible downstream recipients and reporting obligations. |  |
| Require forecast funding breakdown? | Yes; capture funding sources for forecasts. |  |
| Require claim funding breakdown? | Yes; capture funding sources for claims. |  |

### S02. Holdback bases — select from A16

| Agency holdback reference | Name / business code | Select for this stream? | Rate / release policy reference |
| --- | --- | --- | --- |
| **Example — HB1** | Full agreement / FULL | Yes | 10% policy; section 6 holdback rules |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S03. Budgets — allocate from P05

| Program budget reference | Fiscal year | Currency | Stream allocation | Stream overcommitment % / meaning |
| --- | --- | --- | --- | --- |
| **Example — PB1** | 2027–2028 | CAD | 2,000,000.00 | 0% additional commitments |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Reconcile the sum of all stream allocations to each program budget. Example: CAD 5,000,000.00 program budget − CAD 4,500,000.00 allocated across streams = CAD 500,000.00 unallocated. Record your reconciliation in section 6.

### S04. Eligible recipients — select proponent subtypes from A19

| Agency subtype reference | Select as eligible? | Additional criteria / exclusions | Required evidence |
| --- | --- | --- | --- |
| **Example — PS1** | Yes | Must serve an eligible rural community | Registration and service-area description |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S05. Cost line items — select from A09

The agency definition supplies the amount calculation. This stream supplies its cost-sharing ratio. Identify the meaning and base of the ratio; do not confuse it with a calculated cost-line percentage.

| Agency cost line reference | Select for this stream? / active? | Cost-sharing % | Meaning / base | Exclusions / policy |
| --- | --- | --- | --- | --- |
| **Example — CL1** | Yes / Yes | 75% | Program share of eligible accommodation cost | Agency travel limits apply; rates.xlsx |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### S06. Funding subtypes — select from A15

Select individual funding subtypes, not just the parent funding type. Parent stacking and cost-sharing flags remain agency definitions.

| Agency subtype reference | Parent funding type | Select for this stream? | Business note |
| --- | --- | --- | --- |
| **Example — FS1** | FT1 other government funding | Yes | Provincial sources allowed in recipient funding breakdown |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S07. Amendment types — define for this stream

Use the underlying change kind: articles, activities, budget, duration or other. These entries are stream-owned, not agency agreement types.

| Reference | Name EN | Name FR | Change kind | Amendment subtype required? |
| --- | --- | --- | --- | --- |
| **Example — AM1** | Funding change | Modification du financement | Budget | Yes |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### S08. Amendment subtypes — define for this stream

Each subtype can be associated with one or more amendment types from S07.

| Reference | Name EN / FR | Description EN | Description FR | Allowed amendment type references |
| --- | --- | --- | --- | --- |
| **Example — AMS1** | Funding increase / Augmentation du financement | Increase the agreement funding amount | Augmenter le montant du financement de l’entente | AM1 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### S09. Agreement subtypes — select agency agreement types from A03

Despite the screen name, this is a selection of an agency agreement type. Do not invent a separately named stream subtype or an automatic parent/child relationship.

| Agency agreement type reference | Name EN / FR from A03 | Select for this stream? |
| --- | --- | --- |
| **Example — AT1** | Community contribution / Contribution communautaire | Yes |
|   |   |   |
|   |   |   |
|   |   |   |

### S10. Charts of accounts — select from A07

| Agency coding set reference | Fiscal year / currency | Commitment or payment? | Select for this stream? |
| --- | --- | --- | --- |
| **Example — FIN1** | 2027–2028 / CAD | Commitment | Yes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S11. Commitment types — select from A08

| Agency commitment type reference | Name EN / FR | Select for this stream? | Business procedure reference |
| --- | --- | --- | --- |
| **Example — CT1** | Project commitment / Engagement de projet | Yes | commitment-guide.docx |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S12. Monitor types — select from A17

| Agency monitor type reference | Name EN / FR | Select for this stream? | When used |
| --- | --- | --- | --- |
| **Example — MT1** | Financial monitoring / Suivi financier | Yes | Quarterly for high-risk recipients |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S13. Custom fields — sections and selection from A10

Define the stream’s display sections, then assign individual agency fields. An agency field definition and its option list are shared; required, active and placement settings belong to this stream assignment.

| Section reference | Section name EN | Section name FR | Display order |
| --- | --- | --- | --- |
| **Example — SEC1** | Project context | Contexte du projet | 1 |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

| Agency field reference | Select / active? | Required? | Stream section reference | Display order |
| --- | --- | --- | --- | --- |
| **Example — CF1** | Yes / Yes | Yes | SEC1 | 1 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### S14. Risk ratings — define for this stream

The stream rating table stores numeric scores with bilingual labels. Record each score here; assessment score ranges and calculations are separate definitions in section 8. The setup team must map the assessment output to these stream ratings rather than assuming a range entered here will do that.

| Rating reference | Numeric score | Name EN | Name FR |
| --- | --- | --- | --- |
| **Example — RR1** | 3.00 | High | Élevé |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S15. Areas of expertise — define for this stream

| Reference | Name EN | Name FR | Description EN | Description FR |
| --- | --- | --- | --- | --- |
| **Example — EX1** | Rural service delivery | Prestation de services ruraux | Experience delivering rural services | Expérience de la prestation de services en milieu rural |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### S16. Financial limits — define for this stream

Specify the amount and the base/period behind every percentage. Stacking is combined support from the sources defined as counting toward stacking in A15. Provide policy definitions when the business rule requires more detail than the configuration field.

| Detail | Example only | Your response |
| --- | --- | --- |
| Maximum allowable per recipient | CAD 250,000.00 |  |
| Maximum support percentage per recipient | 75% of eligible costs |  |
| Maximum retroactive-cost percentage | 10% of eligible costs; business policy also allows costs only within 90 days before agreement start. |  |
| Stacking limit | 100% of eligible costs from included funding sources |  |
| Financial limit configuration active? | Yes |  |

| Limit | Calculation base | Applies per / period | Policy reference |
| --- | --- | --- | --- |
| **Example — Maximum allowable per recipient** | CAD program funding amount | Recipient over program period; explain multiple agreements | terms.pdf §6 |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S17. Review setups — select published agency review sets from A22

Select the set, not separate copies of its assessments/checklists. The record target must be appropriate for the intended review. Opportunity-specific intake links are also recorded in section 5.

| Agency review set reference | Record / target | Select for this stream? | Intended use |
| --- | --- | --- | --- |
| **Example — RS1** | Application intake | Yes | Completeness and risk review before recommendation |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S18. Document templates — select from A12

| Agency document template reference | Record / target | Select for this stream? | When generated |
| --- | --- | --- | --- |
| **Example — DT1** | Agreement | Yes | After funding decision |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S19. Workflows — select published agency workflows from A24

Recommendations, data collections and approval templates are used through the selected workflow or linked review setup. They do not have independent stream-selection tabs. Any intended default or automatic launch behavior must be confirmed separately.

| Agency workflow reference | Record / target | Purpose | Select for this stream? |
| --- | --- | --- | --- |
| **Example — W1** | Agreement | Approval submission | Yes |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### S20. Extensions — stream-level configuration

Record the installed extension and its stream-specific settings. This does not replace agency enablement in A13. Stream capabilities vary by extension; do not assume a capability or credential can be configured at either level interchangeably.

| Agency-enabled extension | Enable for this stream? | Stream settings / mapping | Source material / contact |
| --- | --- | --- | --- |
| **Example — Portal connector** | Yes | S1 participates in the Spring 2027 opportunity | portal-map.xlsx / Portal team |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

## 5. Funding opportunities and application intake

A stream can have multiple funding calls over time. Capture calls separately from the stream itself. Copy this section for each opportunity; one opportunity may cover multiple streams in the same program.

### Opportunity identity

| Text to supply | English example | French example | Your English text | Your French text |
| --- | --- | --- | --- | --- |
| Call name | Rural Projects — Spring 2027 | Projets ruraux — Printemps 2027 |  |  |

| Detail | Example only | Your response |
| --- | --- | --- |
| Program | Community Capacity Program |  |
| Participating streams | Rural Projects (S1) |  |
| Opening date | 2027-04-15 |  |
| Closing date | 2027-06-30 |  |
| Time zone / cutoff-time requirement | America/Toronto; business requirement: 17:00 on closing day, to be checked against supported intake controls. |  |
| Submission route | Agency application portal; include current form/link and system contact. |  |
| Expected application volume | 150 per call |  |
| Intake contact | rural-program@example.org |  |

### Opportunity status and intake setup selections

Dates alone do not open a call. An opportunity starts in Draft; accepting submissions also requires an eligible non-Draft, writable, nonterminal agency status. Record the intended status for opening below. Review sets and workflows must target **Application intake** and be linked to a participating stream in S17/S19; do not select an Agreement workflow such as W1 for an Intake.

| Opportunity reference | Intended open status from A23 | Intake review set / participating stream | Intake workflow / participating stream, if needed | Setup still needed |
| --- | --- | --- | --- | --- |
| **Example — OPP1 / Spring 2027** | Open; define in A23 | RS1 / S1 | None | Confirm opportunity dates and opening status before accepting submissions |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Applicant-facing questions

One row per question. Give exact wording and choices. Keep these separate from internal staff assessments and checklists. Complete section 12 for other reporting forms.

| Question reference | Question EN / FR | Answer type / choices | Required / condition | Instructions / validation |
| --- | --- | --- | --- | --- |
| **Example — APP1** | Project title / Titre du projet | Short text | Required for all applicants | Maximum 150 characters; provide help text in both languages |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Required application attachments

| Document EN / FR | Required for whom? | Acceptable format / freshness | What staff verify |
| --- | --- | --- | --- |
| **Example — Financial statements / États financiers** | All nonprofit applicants | PDF; most recent financial year | Reporting period and organization name match the application |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### Intake handling

| Situation | What should happen? | Responsible team | Communication / evidence |
| --- | --- | --- | --- |
| **Example — Application missing an attachment** | Return for correction before assessment | Intake team | Send missing-document notice; record response date |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

## 6. Financial procedures and rules supporting stream configuration

Program reference: ______  Stream reference: ______  Finance contact: ______.

Financial configuration is recorded once in S02–S03, S05–S06, S10–S11 and S16. Use the following tables for reconciliation and operational rules, not a second set of configuration values.

### Program-to-stream budget reconciliation

| Program budget reference | Currency | Program total | Total allocated to all streams | Unallocated balance / explanation |
| --- | --- | --- | --- | --- |
| **Example — PB1** | CAD | 5,000,000.00 | 4,500,000.00 | 500,000.00 held for a later call |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Holdback calculation and release policy

Select the actual agency bases in S02. These rows describe their rates, release conditions and exceptions; listing a policy does not automatically select a basis for the stream.

| Selected holdback reference | Rate / amount | Calculation base | Release condition | Exceptions / policy source |
| --- | --- | --- | --- | --- |
| **Example — HB1** | 10% | Program funding specified in agreement | Final report and reconciliation complete | Exemptions documented under holdback-policy.pdf |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Additional financial requirements

| Requirement | Business rule | Affected configuration / process | Policy / contact |
| --- | --- | --- | --- |
| **Example — Multiple agreements for one recipient** | Apply maximum support across the whole program period | S16 recipient limit; setup team to confirm enforcement | terms.pdf §6 / Finance team |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### Financial operations calendar

Describe current procedures even if they happen outside GCS. Distinguish advance payments, claims for incurred costs, and the reconciliation of an advance against reported spending.

| Operation | Trigger / frequency | Required form / evidence | Responsible team | Output / next step |
| --- | --- | --- | --- | --- |
| **Example — Advance reconciliation** | Quarterly | Expense report and supporting documents | Finance / program officer | Confirm eligible spending; identify unused advance |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Add rows for forecasting, commitments, advance payments, claims, payment requests, reconciliation and journal vouchers as applicable.

### Recoveries and credits

| Agency receivable type | Trigger | Follow-up / monitoring | Credit or recovery process | Source procedure |
| --- | --- | --- | --- | --- |
| **Example — Unused advance** | Reported spending is below advance paid | Monthly finance follow-up | Record amount due and apply the documented recovery process | recovery-guide.docx |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

## 7. Workflows and handoffs

Copy this section for each process, such as initial funding, agreement amendment, payment, monitoring or closeout. Describe business work in plain language. The setup team will map it to available workflows, review sets and approval templates.

| Detail | Example only | Your response |
| --- | --- | --- |
| Process name | Initial funding decision |  |
| Program / stream | Community Capacity Program / Rural Projects |  |
| Record the process works on | Submitted application / intake |  |
| Process starts when | Application received |  |
| Process finishes when | Funding decision recorded and agreement preparation begins |  |

### Steps in order

Use one row per step. Give each form or template a short reference and register it in sections 8–12. If steps run in parallel, say so explicitly.

| Step / order | Work to do / template reference | Responsible team or role | Starts after / parallel with | Outcome → next step |
| --- | --- | --- | --- | --- |
| **Example — 1** | Completeness check / C1 | Intake officer | Application received | Complete → risk assessment; incomplete → return to applicant |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Exceptions, returns and escalation

| At step | Condition | Action / destination | Who handles it? | Evidence / message |
| --- | --- | --- | --- | --- |
| **Example — Risk assessment** | Financial statements unavailable | Return to officer for additional evidence | Program officer | Record reason; request missing statements |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Reporting, monitoring and closeout obligations

| Obligation | Due date rule / frequency | Form / evidence reference | Responsible team | What completes it? |
| --- | --- | --- | --- | --- |
| **Example — Final project report** | Within 60 days of agreement end | F2 / final report and expense statement | Program officer | Report reviewed and financial reconciliation complete |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Include periodic reports, site visits, outcome reporting, final claims, unused-fund recovery and any checks needed before closing an agreement.

## 8. Assessment content supporting agency review setups

Register each assessment as a member of an agency review set in A22, then select that set in S17 or reference it in A24. These tables capture the content, not a separate program or stream catalog.

Collect each assessment separately. Typical examples are recipient risk, project merit, financial capacity and technical assessment. Supply the blank form, assessor instructions, scoring workbook and an anonymized completed sample if available.

### Assessment inventory

| Reference | Assessment name EN / FR | Used on / when | Used by which streams? | Current file / contact |
| --- | --- | --- | --- | --- |
| **Example — A1** | Recipient risk / Risque du bénéficiaire | Applicant or recipient before funding recommendation | S1 and S2 | recipient-risk-v3.xlsx / Policy team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Copy the remaining tables in this section for each assessment reference. Assessment reference: ______

### Questions and answer choices

| Question reference / section | Question EN / FR | Answer type / choices | Required / condition | Guidance / evidence |
| --- | --- | --- | --- | --- |
| **Example — A1-Q1 / Financial capacity** | Are current financial statements available? / Les états financiers à jour sont-ils disponibles? | Yes / No; explanation text | Always required | Use latest completed fiscal year; attach statements |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Scoring and calculations

One row per scored question or calculation. If an assessment is unscored, say so. Define missing and N/A answers explicitly so the total can be reproduced.

| Question / calculation | Answer → score mapping / formula | Weight | Missing / N/A treatment | Source guide |
| --- | --- | --- | --- | --- |
| **Example — A1-Q1** | Yes → 1; No → 3; higher = greater risk | 40% | Blank prevents completion; N/A not allowed | assessor-guide.docx, section 2 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Overall ratings and actions

Specify boundaries without gaps or overlaps. Give exact rounding rules if the final score is rounded before assigning a rating.

| Rating EN / FR | Score range / calculation rule | Required action / explanation | Next review trigger |
| --- | --- | --- | --- |
| **Example — High / Élevé** | Weighted mean 2.50–3.00 on a 1–3 scale; no rounding before banding | Additional financial review and recorded rationale | Annually or material change |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### Assessment completion

| Detail | Example only | Your response |
| --- | --- | --- |
| Who completes the assessment? | Program officer |  |
| Additional review needed? | Financial reviewer checks High-risk results. |  |
| When reassessed? | Annually and after material financial changes. |  |
| Where the result is used | Funding recommendation and monitoring plan. |  |
| Material still to collect | French assessor guide; contact: Camille; due: 2027-02-15. |  |

## 9. Checklist content supporting agency review setups

Register each checklist in A22 and select the review set in S17 or reference it in A24.

Use checklists for completeness, eligibility, payment checks, monitoring or closeout. Collect each checklist separately from scored assessments.

### Checklist inventory

| Reference | Checklist name EN / FR | Used on / when | Streams | Current file / contact |
| --- | --- | --- | --- | --- |
| **Example — C1** | Application completeness / Vérification du dossier | Intake before assessment | S1 | completeness-checklist.docx / Intake team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Copy the remaining tables for each checklist reference. Checklist reference: ______

### Checklist items

| Item reference | Check EN / FR | Response choices | Evidence / pass condition | Required / N/A rule |
| --- | --- | --- | --- | --- |
| **Example — C1-01** | Application signed? / Demande signée? | Yes / No | Signature present on submitted form | Required; N/A not allowed |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Completion and failure rules

| Item / whole checklist | Failure or missing-answer condition | Blocks next step? | Follow-up / destination | Who resolves it? |
| --- | --- | --- | --- | --- |
| **Example — C1-01** | No signature | Yes | Return to applicant for correction | Intake officer |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

| Detail | Example only | Your response |
| --- | --- | --- |
| Who completes it? | Intake officer |  |
| When can the checklist be completed? | All required items answered and mandatory checks passed. |  |
| Where the completed checklist is used | Attached to the intake review package. |  |
| Instructions or samples to collect | Blank checklist, completion guide, anonymized completed example. |  |

## 10. Approval and routing slip working materials

Define agency approval templates in A05. Use this section to capture the source slips and business behavior needed to configure their steps/certifications and workflow handoffs.

Collect the slips used for funding decisions, agreements, amendments, payments and other decisions. A paper slip is useful source material; it does not need to already exist in GCS. This section describes operational decisions, not authorization to set up the application.

### Slip inventory

| Reference | Slip name EN / FR | Decision / record it supports | Streams | Current file / contact |
| --- | --- | --- | --- | --- |
| **Example — R1** | Funding decision / Décision de financement | Decision on proposed funding | S1 | funding-routing-slip.docx / Delivery team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Copy the remaining tables for each slip reference. Slip reference: ______

### Routing sequence

One row per reviewer/decision step. Record parallel reviews, acting/on-behalf arrangements and what happens when a reviewer is unavailable.

| Order | Role / team | Review or decision required | Starts after / parallel with | Substitution / unavailable handling |
| --- | --- | --- | --- | --- |
| **Example — 1** | Finance reviewer | Check budget and coding | Officer submits complete package | Named acting finance reviewer; process contact to provide coverage |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Certifications and information on the slip

| At step | Certification / field EN / FR | Answer type / choices | Required evidence / condition |
| --- | --- | --- | --- |
| **Example — Finance review** | Budget checked / Budget vérifié | Checkbox and comments | Budget and coding sheet; required before routing onward |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### Decision and return paths

| At step | Decision / outcome | Reason or conditions required? | Next step / return destination |
| --- | --- | --- | --- |
| **Example — Program manager** | Return for clarification | Yes; record missing information | Return to program officer; finance review repeated only if figures change |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

| Detail | Example only | Your response |
| --- | --- | --- |
| How thresholds change routing | Funding above CAD 100,000 needs an additional director decision; provide the actual threshold rules. |  |
| How the decision is recorded | Decision, date, decision-maker, comments and any acting/on-behalf designation. |  |
| Materials to collect | Blank slip, certifications, decision choices, routing guide and anonymized completed example. |  |

## 11. Recommendation form content

Define the agency recommendation set and member order in A21. Capture each form’s detailed questions and outcomes here, then reference the set from A24.

A recommendation is the proposed decision and rationale, not the final approval. Collect each type separately, including initial funding, amendments and other recommendations used in your process.

### Recommendation inventory

| Reference | Template name EN / FR | Used for / stage | Streams | Current file / contact |
| --- | --- | --- | --- | --- |
| **Example — N1** | Funding recommendation / Recommandation de financement | After assessment, before R1 decision routing | S1 | funding-recommendation.docx / Program team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Copy the remaining tables for each template reference. Recommendation reference: ______

### Information to include

| Field EN / FR | Answer type | Required / condition | Source / guidance | Example response |
| --- | --- | --- | --- | --- |
| **Example — Recommended amount / Montant recommandé** | Money + currency | Required when recommending funding | Officer proposes amount supported by budget | CAD 75,000.00 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Add one row each for requested amount, recommended amount, rationale, assessment results, options considered, conditions and supporting evidence, where applicable.

### Recommendation outcomes

| Outcome EN / FR | When used | Rationale / conditions required | Next process / routing slip |
| --- | --- | --- | --- |
| **Example — Recommend with conditions / Recommander sous conditions** | Project merits funding but requires additional reporting | Explain conditions and how they will be tracked | R1 funding decision |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

### Supporting evidence and checks

| Evidence / assessment reference | Which result is included? | Required when? | What if missing or unfavorable? |
| --- | --- | --- | --- |
| **Example — A1 recipient risk** | Overall rating and explanation | All recommendations | Missing blocks recommendation; High triggers extra review |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

| Detail | Example only | Your response |
| --- | --- | --- |
| Who prepares the recommendation? | Program officer |  |
| When it is revised | Return from decision review or material change in proposed funding. |  |
| Material still needed | Bilingual blank template, writing guidance and anonymized completed example. |  |

## 12. Data collection content and document working materials

Define agency data collection identities in A11, document templates in A12 and custom fields/options in A10. Their question/content details and current source files can be supplied below.

### Reporting and data collection forms

Use this register for progress reports, monitoring forms, final reports and other information collections. Applicant questions belong in section 5; assessments and checklists belong in sections 8–9.

| Reference | Form name EN / FR | Completed by / submitted to | When due | Current file / contact |
| --- | --- | --- | --- | --- |
| **Example — F2** | Final report / Rapport final | Recipient / program officer | 60 days after agreement end | final-report.docx / Program team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Form questions and fields

One row per field. Repeat for each form reference; add evidence/attachment requirements in the following table.

| Form / field reference | Label EN / FR | Answer type / choices | Required / condition | Instructions / validation |
| --- | --- | --- | --- | --- |
| **Example — F2-Q1** | Activities delivered / Activités réalisées | Long text | Required | Describe delivery against the agreed activities |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Supporting documents for forms

| Form reference | Document EN / FR | Required when? | Format / period | Review check |
| --- | --- | --- | --- | --- |
| **Example — F2** | Final expense statement / État final des dépenses | All completed projects | Spreadsheet or PDF; whole agreement period | Totals match final reported spending |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Additional agreement field requirements

Define supported fields and options in A10 and their stream placement/required flags in S13. Use this table only for extra business requirements that need mapping or confirmation; it is not a second definition of those fields.

| Stream | Field EN / FR | Answer type / choices | Required / condition | Section / placement |
| --- | --- | --- | --- | --- |
| **Example — S1** | Service region / Région desservie | Choice: North / South; supply bilingual choices | Required | Agreement general information |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Generated document working materials

Agency template identities are defined in A12 and stream selections in S18. Supply editable source files where possible. List each language version separately and identify any conditional clauses. A file can be provided before its details are mapped to GCS.

| Document name / language | When generated / record | Source file / version | Output format | Contact |
| --- | --- | --- | --- | --- |
| **Example — Contribution agreement / English** | After funding decision / agreement | agreement-en-v2.docx | PDF and DOCX | Program team |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Document content and numbering

| Document | Field / clause / number pattern | Source or rule | Example value |
| --- | --- | --- | --- |
| **Example — Contribution agreement** | Agreement reference | Agency prefix + fiscal year + sequence; setup team to confirm configuration | CDA-2027-0001 |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

Add rows for recipient identity, dates, amounts, bilingual wording, conditions and clauses that appear only for certain agreement types.

## 13. Systems, existing data and day-to-day operation

Complete with the relevant system, finance and records contacts. Mark systems not needed at launch as “Later” or “Not applicable”. These are requirements to assess, not assumed built-in integrations.

### Connected systems and storage

| System / service | Needed at launch / later / N/A | Purpose / data exchanged | System contact | Current interface / material |
| --- | --- | --- | --- | --- |
| **Example — Application portal** | At launch | Applications and attachments sent to intake | IT portal team | Current form and data mapping spreadsheet |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

Consider application portals/forms, financial systems, document storage, identity/sign-in, reporting tools and document/PDF generation. Record contacts and requirements here; technical staff will determine connection details separately.

### Integration field mapping

| Source system / field | Business meaning | Where it is needed in GCS | Direction / timing | Sample format |
| --- | --- | --- | --- | --- |
| **Example — Portal / submission_reference** | External application reference | Intake reference information | Portal → GCS on submission | PORTAL-2027-0123 |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Existing data to bring across

List source datasets and scope, not individual applicant records. Include recipients, open applications, active agreements, balances, attachments and historical records where needed.

| Dataset | Source / format | Approximate volume | History / cutoff date | Contact / cleanup needed |
| --- | --- | --- | --- | --- |
| **Example — Active agreements** | Existing system CSV + document folder | 20 agreements | Open as of 2027-03-31 | Migration team; reconcile outstanding advances |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Records, language and accessibility needs

| Topic | Requirement | Applies to | Policy / contact |
| --- | --- | --- | --- |
| **Example — Retention** | Retain completed case files under agency retention schedule | Applications, assessments, decisions and agreements | records-policy.pdf / Records team |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

Add rows for sensitive information handling, audit/reporting needs, bilingual materials, accessible forms, document formats and any export requirements.

### Teams and account preparation

Collect team names and onboarding needs without designing a permission matrix. Account access will be configured separately with the system administrators.

| Team / group name | Work they handle | Expected users | Contact | Training needed |
| --- | --- | --- | --- | --- |
| **Example — Intake team** | Receive applications and complete C1 checklist | 5 | Intake lead | Application review and corrections |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Support and first-use arrangements

| Activity | Date / timing | Responsible contact | Material / expected result |
| --- | --- | --- | --- |
| **Example — Officer training** | 2027-03-15 | Training lead | Practice case covering assessment through recommendation |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

Add rows for first-use communications, user help, issue reporting, support coverage and ongoing ownership of reference lists and templates.

## 14. Material tracking, open questions and setup checks

### Material register

Use this register to track delivery of the files named throughout the workbook. Link to the correct version; record what still needs to be written or translated.

| Section / item reference | File / material | Status | Contact / due date | Outstanding work |
| --- | --- | --- | --- | --- |
| **Example — 8 / A1** | recipient-risk-v3.xlsx | Partly available | Policy team / 2027-02-15 | French scoring guide still needed |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Open questions

| Question / decision needed | Affected program / stream / process | Contact | Target date | Answer / reference when known |
| --- | --- | --- | --- | --- |
| **Example — When does High risk require extra review?** | S1 / A1 / R1 | Policy lead | 2027-02-15 | Pending |
|   |   |   |   |   |
|   |   |   |   |   |
|   |   |   |   |   |

### Try the complete process before first use

Choose representative fictional cases, including a normal case and exceptions. These are functional checks, not business authorization or project sign-off.

| Scenario | What should happen? | Who can walk through it? | Result / issue / follow-up |
| --- | --- | --- | --- |
| **Example — Complete eligible application** | C1 passes → A1 risk recorded → N1 recommendation → R1 decision → agreement prepared | Intake officer and program officer | Not yet run |
|   |   |   |   |
|   |   |   |   |
|   |   |   |   |

Include missing documents, failed eligibility, High risk, a returned recommendation, routing to an acting reviewer, budget/limit checks, a payment/claim cycle and closeout. Verify both language versions and any connected-system handoff needed at launch.

### Handoff summary

| Detail | Example only | Your response |
| --- | --- | --- |
| Workbook and material location | Shared project folder / configuration-workbook.md |  |
| Setup contact | Sam Lee |  |
| Next working session | 2027-02-08 |  |
| Known gaps for the setup team | French assessment guidance and portal mapping outstanding. |  |
| Items deliberately left for later | Closed historical agreements and optional reporting integration. |  |

Prepared against the GCS–SSC agency/program/stream setup model and related intake, review and workflow concepts. Stakeholder policies, requested calculations and external connections must be mapped to available configuration by the setup team; note gaps in the open-question table rather than assuming automatic support.
