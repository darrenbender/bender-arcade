/* Lone Star Turnover — a Texas creditors' rights game.
   Fictional case: Bluebonnet Building Supply, Inc. v. Hill Country Custom Homes, LLC and Dale R. Rutledge.
   Content lives in CHAPTERS. The engine below renders five event types:
   story, choice, date, check (select all that apply), and sort (put each item in a bin).
   Save data: localStorage key `lone-star-turnover:<player>:save` (see STANDARDS.md §6). */
(function () {
  'use strict';

  /* ------------------------------------------------------------------
     Storage and player
     ------------------------------------------------------------------ */
  const GAME = 'lone-star-turnover';
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage blocked: play continues unsaved */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  // This game is written for adults, so it does not bounce to the player picker.
  // If a player is picked, their saves stay separate; otherwise saves go under "Counsel".
  const player = store.get('arcade-current-player') || 'Counsel';
  const SAVE_KEY = `${GAME}:${player}:save`;
  const IN_ARCADE = /(^|\.)darrenbender\.com$/.test(location.hostname) ||
    location.hostname === 'localhost' || location.hostname === '127.0.0.1';

  /* ------------------------------------------------------------------
     Case constants
     ------------------------------------------------------------------ */
  const JUDGMENT = 219298.18;
  const SOURCES = {
    garnish:     { label: 'Garnishment of HCCH bank account', full: 38412.55 },
    lot:         { label: 'Lake lot payoff (abstract lien)', full: 61500.00 },
    receivables: { label: 'Receivables collected by receiver, net of fee', full: 82140.00 },
    brokerage:   { label: 'Dale’s brokerage account (turnover)', full: 22618.40 },
    boat:        { label: 'Ski boat (fraudulent-transfer suit)', full: 14627.23 }
  };

  /* ------------------------------------------------------------------
     Content
     Choice options: g = 'best' | 'ok' | 'bad'; fb = feedback; money = { source: amount }.
     ------------------------------------------------------------------ */
  const CHAPTERS = [
    /* ================================================================ 1 */
    {
      id: 'intake', title: 'The File Arrives', date: 'Feb. 2, 2026',
      entry: 'Intake, limitations, demand letter',
      intro: 'A lumberyard is owed $184,620 by a homebuilder whose owner personally guaranteed the account. Before you file anything, get the basics right: limitations, which collection laws apply, and setting up attorney’s fees.',
      events: [
        {
          id: 'brief', type: 'story', title: 'The client', cta: 'Take the case',
          body: () => `
            <p>Bluebonnet Building Supply, Inc. is a family-owned lumberyard. It sold framing lumber, trusses, and windows on open account to <b>Hill Country Custom Homes, LLC</b> (HCCH). HCCH stopped paying in October 2025.</p>
            <dl class="facts">
              <div><dt>Client</dt><dd>Bluebonnet Building Supply, Inc. Contact: Rosa Ybarra, credit manager</dd></div>
              <div><dt>Debtor</dt><dd>Hill Country Custom Homes, LLC, a Texas LLC</dd></div>
              <div><dt>Guarantor</dt><dd>Dale R. Rutledge, HCCH’s managing member, married, two kids</dd></div>
              <div><dt>Unpaid</dt><dd><span class="money">$184,620.00</span>, invoices from Sept. 2025 to Jan. 2026</dd></div>
              <div><dt>Documents</dt><dd>2023 credit application signed by Dale, with a personal guaranty, an attorney’s-fee clause, and 18% annual interest on past-due balances. Signed delivery tickets, invoices, and an account statement.</dd></div>
            </dl>
            <p>Your goal: turn this file into money. Every decision below is graded the way a judge, an opposing lawyer, or a court of appeals would grade it.</p>`
        },
        {
          id: 'lim', type: 'choice', title: 'How long do we have?',
          prompt: '<p>Rosa asks how long Bluebonnet has to sue. The oldest unpaid invoice is from September 2025.</p>',
          options: [
            { t: 'Two years. Debt claims follow the general tort period.', g: 'bad',
              fb: 'Two years is the period for torts like negligence and conversion (CPRC § 16.003). Debt and contract claims get four.' },
            { t: 'Four years from accrual.', g: 'best',
              fb: 'Suits on a debt, including breach of contract and open account, must be filed within four years after the claim accrues. You have plenty of time, but evidence and assets don’t improve with age.' },
            { t: 'Ten years, the same as a judgment.', g: 'bad',
              fb: 'Ten years is how long a judgment lasts before it goes dormant without a writ of execution (CPRC § 34.001). The period to sue is shorter.' }
          ],
          law: { title: 'Four years for debt', cite: 'Tex. Civ. Prac. & Rem. Code § 16.004(a)(3), (c)',
            text: 'A suit for debt must be brought within four years after the day the claim accrues. Section 16.004(c) has a special accrual rule for mutual and current (open) accounts.' }
        },
        {
          id: 'fdcpa', type: 'choice', title: 'Which collection laws apply?',
          prompt: '<p>An associate’s draft demand letter includes the federal 30-day validation notice used for consumer collections. Do the federal Fair Debt Collection Practices Act and Texas Finance Code chapter 392 govern this letter?</p>',
          options: [
            { t: 'Yes. Any letter that collects a debt must comply.', g: 'bad',
              fb: 'Both statutes are limited to consumer debts. A builder’s trade account for lumber is not one.' },
            { t: 'Yes, as to Dale, because he’s an individual.', g: 'bad',
              fb: 'Coverage turns on what the debt was for, not who owes it. A personal guaranty of a business’s trade debt is still a business debt.' },
            { t: 'No. This is a business debt, and both laws cover only consumer debts incurred primarily for personal, family, or household purposes.', g: 'best',
              fb: 'Correct. The lumber was bought to build houses for sale, so neither statute applies. Keep the letter professional anyway; it may become an exhibit.' }
          ],
          law: { title: 'Consumer debt only', cite: '15 U.S.C. § 1692a(5); Tex. Fin. Code § 392.001(2)',
            text: 'The FDCPA and the Texas Debt Collection Act apply to obligations incurred primarily for personal, family, or household purposes. Commercial accounts and guaranties of them fall outside both.' }
        },
        {
          id: 'present', type: 'choice', title: 'Setting up attorney’s fees',
          prompt: '<p>Bluebonnet wants its attorney’s fees. The credit application has a fee clause, and you’ll also plead chapter 38 of the Civil Practice and Remedies Code. What should the demand letter do?</p>',
          options: [
            { t: 'Present the claim to both HCCH and Dale now. If they don’t tender the amount owed within 30 days, chapter 38 fees are available.', g: 'best',
              fb: 'Chapter 38 requires presentment, and a party who tenders the just amount owed within 30 days avoids fees. Since the 2021 amendment, § 38.001 also reaches LLCs and other organizations in suits filed on or after September 1, 2021.' },
            { t: 'Skip it. Filing the lawsuit counts as presentment.', g: 'bad',
              fb: 'Texas courts have held that filing suit, by itself, is not presentment. Send the demand.' },
            { t: 'Present only to Dale, because an LLC can never owe chapter 38 fees.', g: 'bad',
              fb: 'That was true under the old statute, which listed only individuals and corporations. The 2021 amendment covers any "organization" under the Business Organizations Code, including LLCs, for actions commenced on or after September 1, 2021.' }
          ],
          law: { title: 'Chapter 38 fees', cite: 'Tex. Civ. Prac. & Rem. Code §§ 38.001(b), 38.002',
            text: 'A claimant may recover reasonable attorney’s fees from an individual or organization on a sworn account or a written or oral contract if it is represented by an attorney, presents the claim, and is not paid the just amount owed within 30 days after presentment. It must also prevail and recover damages.' }
        }
      ]
    },

    /* ================================================================ 2 */
    {
      id: 'forum', title: 'Where to File', date: 'Mar. 6, 2026',
      entry: 'Court and venue',
      intro: 'Thirty days pass with no payment. Pick a court that has jurisdiction over the amount and a county where venue is proper.',
      events: [
        {
          id: 'court', type: 'choice', title: 'Which court?',
          prompt: '<p>The claim is $184,620 plus interest and fees. HCCH and Dale live and do business in Bluebonnet County. Where can you file?</p>',
          options: [
            { t: 'Justice court. Debt claim cases are its specialty.', g: 'bad',
              fb: 'Justice courts handle debt claims only up to $20,000. This claim is more than nine times that.' },
            { t: 'District court. A county court at law would also work if its jurisdiction covers this amount.', g: 'best',
              fb: 'District courts have general jurisdiction. Statutory county courts handle civil cases up to a cap that excludes interest, statutory or punitive damages and penalties, and attorney’s fees and costs. The cap was $250,000 for years and was raised to $325,000 by 2025 legislation. Some courts have their own statutes, so check yours.' },
            { t: 'The Texas Business Court.', g: 'bad',
              fb: 'The Business Court hears only specific categories, such as internal governance disputes and large commercial cases with high amount-in-controversy thresholds. A $185,000 trade debt doesn’t qualify.' }
          ],
          law: { title: 'Jurisdiction by amount', cite: 'Tex. Gov’t Code §§ 27.031, 25.0003, ch. 25A',
            text: 'Justice courts: up to $20,000. Statutory county courts: up to $325,000 under 2025 legislation (previously $250,000), excluding interest, statutory or punitive damages and penalties, and attorney’s fees and costs. District courts: general jurisdiction. The Business Court has limited jurisdiction with multimillion-dollar thresholds.' }
        },
        {
          id: 'venue', type: 'choice', title: 'The venue clause',
          prompt: '<p>The fine print on the credit application says all suits <em>"shall be brought exclusively in Harris County."</em> No party lives in Harris County, and nothing happened there. Do you follow the clause?</p>',
          options: [
            { t: 'Yes. Texas enforces venue clauses in signed contracts.', g: 'bad',
              fb: 'Venue in Texas is set by statute. Contractual venue-selection clauses are generally unenforceable unless a statute makes them so.' },
            { t: 'No. File in Bluebonnet County, where the defendants live and the events happened. The "major transaction" exception requires $1 million or more.', g: 'best',
              fb: 'Correct. Section 15.020 enforces venue agreements only in major transactions of $1 million or more. Bluebonnet County is proper under the general venue rule.' },
            { t: 'It doesn’t matter. Venue can’t be challenged in a collection suit.', g: 'bad',
              fb: 'Any defendant can file a motion to transfer venue. Filing in the wrong county costs months.' }
          ],
          law: { title: 'Venue rules', cite: 'Tex. Civ. Prac. & Rem. Code §§ 15.002, 15.020',
            text: 'Venue is generally proper where all or a substantial part of the events occurred, or in the defendant’s county of residence or principal office. Venue-selection agreements are enforced in "major transactions" of $1 million or more.' }
        }
      ]
    },

    /* ================================================================ 3 */
    {
      id: 'petition', title: 'The Original Petition', date: 'Mar. 9, 2026',
      entry: 'Plaintiff’s Original Petition filed',
      intro: 'Draft the petition: the right claims against each defendant, the required statement of relief, and an affidavit that makes the account prima facie evidence.',
      events: [
        {
          id: 'claims', type: 'choice', title: 'Plead your claims',
          prompt: '<p>Which claims fit the documents?</p>',
          options: [
            { t: 'Suit on sworn account and breach of contract against HCCH. Breach of guaranty against Dale.', g: 'best',
              fb: 'HCCH bought goods on open account, so Rule 185 fits HCCH. Dale’s liability comes from a separate contract, the guaranty, so you sue him for breaching it.' },
            { t: 'Suit on sworn account against both HCCH and Dale.', g: 'ok',
              fb: 'Close. Rule 185 covers the parties to the account. Dale didn’t buy anything; he promised to pay if HCCH didn’t. Plead breach of guaranty against him, or the sworn-account shortcuts may not help you against him.' },
            { t: 'Fraud against Dale, so the debt survives any bankruptcy.', g: 'bad',
              fb: 'Plead what the facts support. A builder who stops paying is not a fraud case, and a groundless fraud claim invites sanctions under Rule 13 and CPRC chapter 10.' }
          ],
          law: { title: 'Sworn account vs. guaranty', cite: 'Tex. R. Civ. P. 185',
            text: 'Rule 185 applies to claims on open account for goods or services sold. A claim against a guarantor is a separate contract claim: you must prove the guaranty, the underlying debt, that the conditions for the guarantor’s liability occurred, and that the guarantor failed to pay.' }
        },
        {
          id: 'r47', type: 'choice', title: 'Rule 47(c) statement',
          prompt: '<p>Rule 47(c) requires a statement of the relief you seek. Bluebonnet seeks $184,620 plus interest, fees, and costs. Which statement do you use?</p>',
          options: [
            { t: '"Only monetary relief of $250,000 or less, excluding interest, statutory or punitive damages and penalties, and attorney fees and costs."', g: 'best',
              fb: 'Correct for a March 2026 filing. It also makes this an expedited action under Rule 169, with Level 1 discovery limits and a faster route to trial. In 2026 the Supreme Court approved raising this figure in Rules 47 and 169 to $325,000, so use the version in effect when you file.' },
            { t: '"Monetary relief over $1,000,000."', g: 'bad',
              fb: 'Overpleading misstates the claim and takes you out of the expedited-actions rules for no reason.' },
            { t: 'Leave it out. The prayer already states the amount.', g: 'bad',
              fb: 'A party that doesn’t include a Rule 47(c) statement may not conduct discovery until it amends its pleading.' }
          ],
          law: { title: 'Statement of relief', cite: 'Tex. R. Civ. P. 47(c)–(d), 169, 190.2',
            text: 'An original pleading must state one of the Rule 47(c) categories of relief. Suits seeking only monetary relief under the lowest category ($250,000 from 2021; $325,000 under a 2026 amendment), excluding interest, statutory or punitive damages and penalties, and attorney fees and costs, are expedited actions under Rule 169.' }
        },
        {
          id: 'affiant', type: 'choice', title: 'Who swears to the account?',
          prompt: '<p>Rule 185 requires an affidavit supporting the account. Who should sign it?</p>',
          options: [
            { t: 'You. You’ve reviewed the whole file.', g: 'bad',
              fb: 'You don’t have personal knowledge of the account, and you’d risk becoming a fact witness in your own case.' },
            { t: 'Rosa Ybarra, the credit manager who keeps the account records.', g: 'best',
              fb: 'She has personal knowledge. Her affidavit should say the claim is within her knowledge, is just and true, is due, and that all just and lawful offsets, payments, and credits have been allowed.' },
            { t: 'No one. Accounts don’t need a verified petition.', g: 'bad',
              fb: 'Without the affidavit, the account isn’t prima facie evidence, and the defendant doesn’t need a sworn denial to contest it.' }
          ],
          law: { title: 'Sworn account affidavit', cite: 'Tex. R. Civ. P. 185, 93(10)',
            text: 'A properly verified account is taken as prima facie evidence unless the defendant files a written denial under oath. A general denial alone doesn’t put the account in issue.' }
        }
      ]
    },

    /* ================================================================ 4 */
    {
      id: 'service', title: 'Citation & Service', date: 'Mar. 18, 2026',
      entry: 'Citations issued and served',
      intro: 'No service, no judgment. Default judgments on defective service get reversed, because courts require strict compliance with the service rules.',
      events: [
        {
          id: 'svc-llc', type: 'choice', title: 'Serving the LLC',
          prompt: '<p>The clerk issues citation for HCCH. How do you serve an LLC?</p>',
          options: [
            { t: 'Serve its registered agent at the registered office on file with the Secretary of State.', g: 'best',
              fb: 'Correct. The registered agent is the entity’s agent for service. Check the Secretary of State’s records the week you serve, since agents change.' },
            { t: 'Mail the citation to HCCH’s office by first-class mail.', g: 'bad',
              fb: 'Rule 106 permits certified mail, return receipt requested, sent by the clerk or another authorized person. First-class mail isn’t service.' },
            { t: 'Serve the Secretary of State today. It’s faster.', g: 'bad',
              fb: 'The Secretary of State becomes the agent only if the registered agent can’t be found at the registered office with reasonable diligence. Jumping ahead invites a reversed default.' }
          ],
          law: { title: 'Serving entities', cite: 'Tex. Bus. Orgs. Code §§ 5.201, 5.251, 5.255; Tex. R. Civ. P. 106(a)',
            text: 'Serve an entity through its registered agent. For an LLC, each manager of a manager-managed LLC, or each member of a member-managed LLC, is also an agent for service. If the registered agent can’t be found at the registered office with reasonable diligence, the Secretary of State becomes the agent.' }
        },
        {
          id: 'dodge', type: 'choice', title: 'The guarantor is dodging',
          prompt: '<p>Your process server has tried Dale’s house five times at different hours. The lights go off when she knocks. Dale posts on social media every day and answers business email. What next?</p>',
          options: [
            { t: 'Tape the citation to his front door.', g: 'bad',
              fb: 'Not without a court order. Unauthorized substitute service won’t support a default.' },
            { t: 'Move for substituted service under Rule 106(b), with the server’s sworn statement of attempts. Ask to leave it with anyone over 16 at his home, or to serve by email or social media.', g: 'best',
              fb: 'Correct. Since December 31, 2020, Rule 106(b) lets the court authorize service by email, social media, or other technology when it’s reasonably effective to give notice. Follow the order exactly.' },
            { t: 'Serve Dale through HCCH’s registered agent.', g: 'bad',
              fb: 'HCCH’s registered agent is HCCH’s agent, not Dale’s. You’re suing Dale individually as guarantor.' },
            { t: 'Serve him by publication.', g: 'bad',
              fb: 'Publication is for defendants whose residence is unknown or who are absent from Texas. You know exactly where Dale lives.' }
          ],
          law: { title: 'Substituted service', cite: 'Tex. R. Civ. P. 106(b), 109',
            text: 'On a motion supported by a sworn statement showing service was attempted at a specific location and failed, the court may authorize leaving the papers with anyone over 16 there, or any other method, including electronic, that will be reasonably effective to give notice.' }
        },
        {
          id: 'ans-date', type: 'date', title: 'When is the answer due?',
          prompt: '<p>HCCH’s registered agent was served on <b>Wednesday, March 18, 2026</b>. Tap the day HCCH’s answer is due in district court.</p>',
          months: ['2026-03', '2026-04'], marks: ['2026-03-18'], answer: '2026-04-13',
          near: {
            '2026-04-07': 'April 7 is day 20. The answer isn’t due on day 20; it’s due the Monday after day 20 ends.',
            '2026-04-06': 'April 6 is the Monday before day 20 ends. Too early.',
            '2026-04-08': 'Close, but Rule 99 answer dates always fall on a Monday.',
            '2026-04-20': 'One week late. Find the first Monday after day 20.',
            '2026-03-30': 'Too early. Count 20 days first.'
          },
          fb: 'Twenty days after March 18 is Tuesday, April 7. The answer is due by 10:00 a.m. on the Monday after that: <b>April 13, 2026</b>.',
          law: { title: 'Answer day', cite: 'Tex. R. Civ. P. 99(b), 4',
            text: 'In district and county court, the answer is due by 10:00 a.m. on the Monday next after the expiration of 20 days after service. (Justice court is different: 14 days.)' }
        }
      ]
    },

    /* ================================================================ 5 */
    {
      id: 'default', title: 'Default & the Late Answer', date: 'Apr. 17, 2026',
      entry: 'Default against HCCH; Dale answers',
      intro: 'HCCH doesn’t answer. Dale, served later, cuts it close. Get the default right, defend it, and know what it does and doesn’t let you do.',
      events: [
        {
          id: 'earliest', type: 'date', title: 'Earliest default date',
          prompt: '<p>April 13 passes with no answer from HCCH. Your process server didn’t e-file the return of service until <b>Monday, April 6</b>. Tap the earliest date the judge may sign a default judgment against HCCH.</p>',
          months: ['2026-04'], marks: ['2026-04-06', '2026-04-13'], answer: '2026-04-17',
          near: {
            '2026-04-13': 'April 13 is the answer date, but the return hasn’t been on file for 10 days yet.',
            '2026-04-14': 'The answer deadline has passed, but the return hasn’t been on file 10 days.',
            '2026-04-16': 'April 16 is only the 10th day. The 10 days must be complete, excluding both the filing day and the judgment day.',
            '2026-04-15': 'Not yet. Count 10 days, excluding the filing day and the day of judgment.'
          },
          fb: 'The return must be on file for 10 days, excluding the day it was filed and the day of judgment. April 7 is day 1 and April 16 is day 10, so <b>April 17</b> is the first eligible date, even though the answer date was April 13.',
          law: { title: 'Return on file 10 days', cite: 'Tex. R. Civ. P. 107(h)',
            text: 'No default judgment may be granted until proof of service has been on file with the clerk for 10 days, exclusive of the day of filing and the day of judgment.' }
        },
        {
          id: 'packet', type: 'check', title: 'Build the default packet',
          prompt: '<p>Select everything you need to take a no-answer default against HCCH.</p>',
          items: [
            { t: 'Return of service on file for at least 10 days', ok: true, why: 'Rule 107(h). And the citation and return must strictly comply with the rules.' },
            { t: 'Certificate of HCCH’s last known mailing address', ok: true, why: 'Rule 239a. The clerk mails notice of the default to that address.' },
            { t: 'Rosa’s sworn account affidavit and invoices proving the amount', ok: true, why: 'A liquidated claim proved by written instruments lets the court assess damages without a live evidentiary hearing (Rule 241).' },
            { t: 'Evidence of your reasonable attorney’s fees', ok: true, why: 'Attorney’s fees are unliquidated, so the court needs evidence, usually an affidavit with billing detail.' },
            { t: 'A proposed default judgment', ok: true, why: 'Give the judge something to sign.' },
            { t: 'Proof you gave HCCH 45 days’ notice of the hearing', ok: false, why: 'Rule 245’s 45-day notice applies to trial settings in contested cases. A defendant who never answered isn’t entitled to notice of the default hearing.' },
            { t: 'A jury demand and jury fee', ok: false, why: 'No. The court decides a no-answer default.' }
          ],
          fb: 'Defaults get attacked on the details. With an individual defendant you’d also file a Servicemembers Civil Relief Act affidavit (50 U.S.C. § 3931).',
          law: { title: 'No-answer default', cite: 'Tex. R. Civ. P. 107, 239, 239a, 241, 243',
            text: 'After the answer date, the plaintiff may take a default if the return has been on file 10 days. Liquidated damages proved by a written instrument may be assessed on the papers; unliquidated damages, including attorney’s fees, require evidence.' }
        },
        {
          id: 'craddock', type: 'choice', title: 'HCCH wakes up',
          prompt: '<p>The court signs the default against HCCH on April 17. Ten days later, HCCH’s new lawyer moves to set it aside. Its affidavit says the registered agent misplaced the papers. On the merits, it says only: <em>"HCCH disputes the balance."</em> How should the court rule?</p>',
          options: [
            { t: 'Grant it. Texas courts prefer trials on the merits.', g: 'bad',
              fb: 'Texas courts do favor merits trials, but the movant still has to satisfy all three Craddock elements.' },
            { t: 'Deny it. The motion doesn’t set up a meritorious defense.', g: 'best',
              fb: 'Correct. The movant must allege facts that would be a defense, supported by affidavits or other evidence. "We dispute the balance" isn’t a defense.' },
            { t: 'Deny it. Losing the papers is always conscious indifference.', g: 'ok',
              fb: 'Right result, wrong reason. A credible explanation of an agent’s mistake can satisfy the first element. The motion fails on the second.' }
          ],
          law: { title: 'The Craddock test', cite: 'Craddock v. Sunshine Bus Lines, Inc., 133 S.W.2d 124 (Tex. Comm’n App. 1939, opinion adopted); Ivy v. Carrell, 407 S.W.2d 212 (Tex. 1966)',
            text: 'A default should be set aside if (1) the failure to answer was not intentional or the result of conscious indifference but was due to a mistake or accident; (2) the motion sets up a meritorious defense; and (3) a new trial won’t cause delay or otherwise injure the plaintiff.' }
        },
        {
          id: 'letter', type: 'choice', title: 'The letter answer',
          prompt: '<p>Dale was served by email under a Rule 106 order on Wednesday, April 1, so his answer was due Monday, April 27. At 8:55 a.m. on April 28, before your 9:00 default hearing, Dale files a signed letter: <em>"I got the papers. I don’t owe this. My address is 1418 Pecan St."</em> What happens?</p>',
          options: [
            { t: 'Take the default. His answer was a day late.', g: 'bad',
              fb: 'A late answer still counts if it’s on file before the default is signed.' },
            { t: 'No default. Any answer on file before a default is signed prevents a no-answer default, and a signed pro se letter like this one can be an answer.', g: 'best',
              fb: 'Correct. Now you need summary judgment or a trial against Dale.' },
            { t: 'Move to strike the letter because it isn’t formatted as a pleading.', g: 'bad',
              fb: 'Courts read pro se answers liberally. A signed letter that identifies the parties and the case, acknowledges the suit, and gives an address is enough.' }
          ],
          law: { title: 'Any answer before judgment', cite: 'Davis v. Jefferies, 764 S.W.2d 559 (Tex. 1989); Smith v. Lippmann, 826 S.W.2d 137 (Tex. 1992)',
            text: 'A default judgment may not be rendered after the defendant has filed an answer, even a late one. A pro se letter that identifies the parties, the case, and the defendant’s address can be a sufficient answer.' }
        },
        {
          id: 'interloc', type: 'choice', title: 'Can you collect yet?',
          prompt: '<p>Rosa sees the April 17 default against HCCH and asks you to garnish HCCH’s bank account today. Your claim against Dale is still pending. Can you?</p>',
          options: [
            { t: 'Yes. A default judgment is enforceable when signed.', g: 'bad',
              fb: 'Not this one. It’s interlocutory because it doesn’t dispose of the claims against Dale.' },
            { t: 'No. A judgment that doesn’t dispose of every claim and party is interlocutory. Sever HCCH’s claims or finish the case against Dale to get a final judgment.', g: 'best',
              fb: 'Correct. Execution and post-judgment garnishment require a final judgment. You decide to move quickly for summary judgment against Dale and get one final judgment against both defendants.' },
            { t: 'No. You must wait six months for the restricted-appeal deadline.', g: 'bad',
              fb: 'The restricted-appeal window doesn’t delay enforcement. Finality is the issue.' }
          ],
          law: { title: 'Interlocutory judgments', cite: 'Lehmann v. Har-Con Corp., 39 S.W.3d 191 (Tex. 2001); Tex. R. Civ. P. 41',
            text: 'A judgment rendered without a conventional trial is final only if it actually disposes of every pending claim and party or clearly and unequivocally states that it finally disposes of all claims and parties.' }
        }
      ]
    },

    /* ================================================================ 6 */
    {
      id: 'msj', title: 'Summary Judgment', date: 'Apr. 30, 2026',
      entry: 'Motion for summary judgment against Dale',
      intro: 'Dale’s letter is effectively a general denial. Win without a trial by proving every element with competent evidence, under the summary-judgment rule Texas rewrote effective March 1, 2026.',
      events: [
        {
          id: 'msj-type', type: 'choice', title: 'Which motion?',
          prompt: '<p>You want judgment on your guaranty claim against Dale without a trial. Which motion do you file?</p>',
          options: [
            { t: 'A no-evidence motion. Dale has no evidence.', g: 'bad',
              fb: 'A no-evidence motion attacks elements the other side has the burden to prove. You can’t use one to win your own claim.' },
            { t: 'A traditional motion with evidence conclusively proving each element of the guaranty claim.', g: 'best',
              fb: 'Correct. As the plaintiff, you must conclusively prove each element. A no-evidence motion is useful only against affirmative defenses Dale must prove.' },
            { t: 'A Rule 91a motion to dismiss.', g: 'bad',
              fb: 'Rule 91a dismisses baseless causes of action. It’s a tool against claims, not for winning your own.' }
          ],
          law: { title: 'Traditional vs. no-evidence', cite: 'Tex. R. Civ. P. 166a',
            text: 'A traditional motion requires the movant to show no genuine issue of material fact and entitlement to judgment as a matter of law. A no-evidence motion challenges elements on which the nonmovant bears the burden of proof. The 2026 rewrite changed the deadlines, not this basic division.' }
        },
        {
          id: 'msj-date', type: 'date', title: 'Response deadline',
          prompt: '<p>You file and e-serve your motion and evidence on <b>Thursday, April 30, 2026</b>. Under Rule 166a as rewritten effective March 1, 2026, tap the day Dale’s response is due.</p>',
          months: ['2026-05', '2026-06'], answer: '2026-05-21',
          near: {
            '2026-05-14': 'May 14 is only 14 days after filing.',
            '2026-05-20': 'May 20 is day 20. Count all 21.',
            '2026-05-22': 'One day late.',
            '2026-06-04': 'June 4 is day 35. That’s about when the hearing can be set, not when the response is due.',
            '2026-05-28': 'That’s day 28. Under the new rule the response runs 21 days from filing, not from the hearing.'
          },
          fb: 'Under the rewritten rule, deadlines run forward from filing. The response is due 21 days after the motion is filed: <b>May 21</b>. Your reply is due 7 days after the response. The hearing can’t be set within 35 days of filing, so the court sets it for June 8.',
          law: { title: 'Summary-judgment timing (2026)', cite: 'Tex. R. Civ. P. 166a (as amended eff. Mar. 1, 2026)',
            text: 'For motions filed on or after March 1, 2026: response due 21 days after the motion is filed; reply due 7 days after the response; no hearing or submission within 35 days after filing, and generally one within 60 days; the court must rule within 90 days after the hearing or submission. Under the old rule, deadlines ran backward from the hearing.' }
        },
        {
          id: 'collection', type: 'choice', title: '"Sue HCCH first"',
          prompt: '<p>Dale’s response: <em>"I’m only a guarantor. Bluebonnet has to collect from HCCH first."</em> His guaranty says it is <em>"an absolute and unconditional guaranty of payment and not of collection"</em> and waives any right to require Bluebonnet to pursue HCCH first. Does his defense work?</p>',
          options: [
            { t: 'Yes. Guarantors are always secondary.', g: 'bad',
              fb: 'Only a guaranty of collection requires the creditor to pursue the principal first.' },
            { t: 'No. A guaranty of payment lets the creditor sue the guarantor without first pursuing the debtor, and Dale waived those rights.', g: 'best',
              fb: 'Correct. A guarantor of payment is primarily liable once the debt is due. Here you’ve also sued HCCH, so you’d satisfy any rule against judgments on secondary liability anyway.' },
            { t: 'Only if HCCH has no assets.', g: 'bad',
              fb: 'HCCH’s assets don’t matter under a guaranty of payment.' }
          ],
          law: { title: 'Payment vs. collection', cite: 'Hopkins v. First Nat’l Bank at Brownsville, 551 S.W.2d 343 (Tex. 1977); Tex. Civ. Prac. & Rem. Code § 17.001; Tex. R. Civ. P. 31',
            text: 'A guarantor of payment is primarily liable and may be sued without first suing the principal debtor. Section 17.001 and Rule 31 protect sureties and guarantors of collection. Guaranty forms commonly waive these protections anyway.' }
        },
        {
          id: 'fees', type: 'choice', title: 'Proving attorney’s fees',
          prompt: '<p>You’re asking for $21,350 in attorney’s fees. Which proof will hold up?</p>',
          options: [
            { t: 'Your affidavit: "Based on my experience, $21,350 is reasonable and necessary."', g: 'bad',
              fb: 'That’s conclusory. Rohrmoos requires proof of the work done, by whom, when, the reasonable hours, and the reasonable rate.' },
            { t: 'Your affidavit describing the services, who performed them, when, the reasonable hours, and the reasonable rates, with billing records attached.', g: 'best',
              fb: 'Correct. That’s the lodestar showing. Billing records aren’t strictly required, but the court strongly encouraged them.' },
            { t: 'The fee clause in the credit application.', g: 'bad',
              fb: 'A fee clause gives you a right to fees. You still have to prove a reasonable amount.' }
          ],
          law: { title: 'Lodestar proof', cite: 'Rohrmoos Venture v. UTSW DVA Healthcare, LLP, 578 S.W.3d 469 (Tex. 2019)',
            text: 'A fee claimant must prove reasonable hours worked times a reasonable hourly rate, with enough detail about the services, who performed them, when, and how long they took. General, conclusory testimony isn’t enough.' }
        }
      ]
    },

    /* ================================================================ 7 */
    {
      id: 'judgment', title: 'Final Judgment', date: 'June 8, 2026',
      entry: 'Final judgment signed',
      intro: 'At the June 8 hearing, the court grants your motion. One judgment will cover both defendants, jointly and severally: $219,298.18 in principal, prejudgment interest, attorney’s fees, and costs.',
      events: [
        {
          id: 'finality', type: 'choice', title: 'Make it final',
          prompt: '<p>Which closing language makes the judgment final?</p>',
          options: [
            { t: '"All relief not expressly granted is denied."', g: 'bad',
              fb: 'That "Mother Hubbard" clause alone doesn’t show finality in a judgment rendered without a conventional trial.' },
            { t: '"This judgment finally disposes of all claims and all parties and is appealable."', g: 'best',
              fb: 'Correct. Lehmann’s clear and unequivocal finality language starts the appellate and enforcement clocks.' },
            { t: '"So ordered."', g: 'bad',
              fb: 'That says nothing about whether all claims and parties are disposed of.' }
          ],
          law: { title: 'Finality language', cite: 'Lehmann v. Har-Con Corp., 39 S.W.3d 191 (Tex. 2001)',
            text: 'Language such as "This judgment finally disposes of all parties and all claims and is appealable" leaves no doubt about the court’s intent. A Mother Hubbard clause alone does not.' }
        },
        {
          id: 'pji', type: 'choice', title: 'Post-judgment interest',
          prompt: '<p>The credit application provides 18% annual interest on past-due balances. What post-judgment interest rate goes in the judgment?</p>',
          options: [
            { t: '18%: the contract rate, because a judgment on a contract that provides for interest earns the lesser of the contract rate or 18%.', g: 'best',
              fb: 'Correct. At 18%, interest on a $219,298.18 judgment adds roughly $108 a day. That gives Dale a reason to pay.' },
            { t: 'The prime-based statutory rate, between 5% and 15%.', g: 'bad',
              fb: 'That rate applies when the contract doesn’t provide for interest.' },
            { t: 'None. Post-judgment interest requires a separate motion.', g: 'bad',
              fb: 'Post-judgment interest is set by statute. State the rate in the judgment.' }
          ],
          law: { title: 'Post-judgment interest', cite: 'Tex. Fin. Code §§ 304.002, 304.003',
            text: 'A judgment on a contract that provides for interest earns post-judgment interest at the lesser of the contract rate or 18% a year. Otherwise, it is the prime rate as published by the Federal Reserve, set monthly by the Consumer Credit Commissioner, with a 5% floor and 15% cap.' }
        },
        {
          id: 'exec-date', type: 'date', title: 'When can execution issue?',
          prompt: '<p>The final judgment is signed <b>Monday, June 8, 2026</b>. No one files a motion for new trial or supersedes the judgment. Tap the first day the clerk may issue a writ of execution.</p>',
          months: ['2026-06', '2026-07'], marks: ['2026-06-08'], answer: '2026-07-09',
          near: {
            '2026-07-08': 'July 8 is day 30. Execution issues after the 30 days have run.',
            '2026-07-10': 'One day late. July 9 works.',
            '2026-06-09': 'Too soon. The judgment debtor has 30 days to file post-judgment motions or supersede.',
            '2026-07-06': 'Too soon. Count 30 days from June 8.'
          },
          fb: 'Day 30 after June 8 is July 8. The clerk may issue execution after the 30 days run: <b>July 9</b>. A timely motion for new trial would restart the count from when it’s overruled.',
          law: { title: 'Time for execution', cite: 'Tex. R. Civ. P. 627',
            text: 'If the judgment is not superseded, the clerk issues execution on request after 30 days from the signing of the final judgment, or after 30 days from the overruling of a timely motion for new trial.' }
        },
        {
          id: 'supersede', type: 'choice', title: '"I’m appealing"',
          prompt: '<p>Dale emails: <em>"I’m appealing. You can’t touch me until the appeal is over."</em> Is he right?</p>',
          options: [
            { t: 'Yes. A notice of appeal stops enforcement.', g: 'bad',
              fb: 'An appeal alone doesn’t suspend enforcement. The judgment must be superseded.' },
            { t: 'No. Only superseding the judgment with a bond, deposit, or other security suspends enforcement.', g: 'best',
              fb: 'Correct. For a money judgment, security equals compensatory damages, interest for the estimated length of the appeal, and costs, capped at the lesser of 50% of the debtor’s net worth or $25 million. Dale never posts it.' },
            { t: 'Yes, but only for 90 days.', g: 'bad',
              fb: 'There’s no automatic 90-day pause.' }
          ],
          law: { title: 'Superseding a judgment', cite: 'Tex. R. App. P. 24.1–24.2; Tex. Civ. Prac. & Rem. Code § 52.006',
            text: 'A judgment debtor may suspend enforcement by filing a bond, making a deposit, or providing other approved security. For money judgments, the amount is capped at the lesser of 50% of the debtor’s net worth or $25 million.' }
        }
      ]
    },

    /* ================================================================ 8 */
    {
      id: 'discovery', title: 'Finding the Money', date: 'July 21, 2026',
      entry: 'Post-judgment discovery; abstract recorded',
      intro: 'A judgment is a piece of paper. Find out what Dale and HCCH own, and lock down the real estate.',
      events: [
        {
          id: 'pjd', type: 'choice', title: 'Asset discovery',
          prompt: '<p>Dale never posts security. You need to know what he and HCCH own. What’s your tool?</p>',
          options: [
            { t: 'Post-judgment discovery: interrogatories, document requests, a deposition of Dale, and subpoenas to third parties such as banks.', g: 'best',
              fb: 'Correct. Rule 621 allows discovery from any person to aid enforcement. Bank-record subpoenas must follow the customer-notice procedure in Finance Code § 59.006.' },
            { t: 'Nothing. Discovery closed when the judgment was signed.', g: 'bad',
              fb: 'Pretrial discovery ended. Post-judgment discovery is just beginning.' },
            { t: 'File a new lawsuit to get discovery.', g: 'bad',
              fb: 'Unnecessary. Use the same cause number.' }
          ],
          law: { title: 'Post-judgment discovery', cite: 'Tex. R. Civ. P. 621; Tex. Fin. Code § 59.006',
            text: 'A judgment creditor may obtain discovery from any person, including the judgment debtor, to aid enforcement, using the same discovery tools available before trial.' }
        },
        {
          id: 'assets', type: 'story', title: 'What discovery found', cta: 'Continue',
          body: () => `
            <p>Dale’s deposition and documents show:</p>
            <dl class="facts">
              <div><dt>HCCH bank</dt><dd>Operating account at Brazos Prairie Bank. The balance swings between $30,000 and $45,000.</dd></div>
              <div><dt>Receivables</dt><dd>Final construction draws of about $96,000 owed to HCCH by two homeowners</dd></div>
              <div><dt>Homestead</dt><dd>Dale’s family home at 1418 Pecan St., Bluebonnet County</dd></div>
              <div><dt>Lake lot</dt><dd>A vacant lot in <b>Granite County</b>, titled to Dale, with no mortgage</dd></div>
              <div><dt>Retirement</dt><dd>401(k), about $212,000</dd></div>
              <div><dt>Brokerage</dt><dd>Online brokerage account, about $22,600. The broker has no Texas office.</dd></div>
              <div><dt>LLC interest</dt><dd>50% of Rutledge Lake Rentals, LLC, which owns two rental cabins</dd></div>
              <div><dt>Vehicles</dt><dd>Dale’s pickup and his wife’s SUV, plus two deer rifles</dd></div>
              <div><dt>Insurance</dt><dd>Whole life policy with $31,000 cash value</dd></div>
              <div><dt>The boat</dt><dd>A 2023 ski boat "sold" in December 2025 to Dale’s brother-in-law for $1. It’s still in Dale’s driveway.</dd></div>
            </dl>`
        },
        {
          id: 'abstract', type: 'choice', title: 'Recording the abstract',
          prompt: '<p>You get an abstract of judgment from the clerk. Where do you record it?</p>',
          options: [
            { t: 'In Bluebonnet County only, where the case was filed.', g: 'bad', money: { lot: 0 },
              fb: 'A judgment lien attaches only in counties where the abstract is recorded and indexed. The lake lot is in Granite County, so it stays unencumbered.' },
            { t: 'In the real property records of Bluebonnet County and Granite County, and anywhere else Dale may own or buy land.', g: 'best', money: { lot: 61500.00 },
              fb: 'Correct. Once recorded and indexed, the abstract creates a lien on Dale’s non-exempt real property in that county, including land he acquires later, for 10 years. It doesn’t attach to his homestead.' },
            { t: 'Nowhere. A final judgment is automatically a lien statewide.', g: 'bad', money: { lot: 0 },
              fb: 'A judgment by itself creates no real property lien. Recording and indexing the abstract does.' }
          ],
          law: { title: 'Judgment liens', cite: 'Tex. Prop. Code §§ 52.001, 52.003, 52.006',
            text: 'A recorded and indexed abstract of judgment creates a lien on the debtor’s non-exempt real property in that county, now owned or later acquired, lasting 10 years unless the judgment goes dormant. The abstract must include the details required by § 52.003, such as the debtor’s address and identifying information.' }
        }
      ]
    },

    /* ================================================================ 9 */
    {
      id: 'garnish', title: 'Garnishment', date: 'July 27, 2026',
      entry: 'Writ of garnishment, Brazos Prairie Bank',
      intro: 'HCCH keeps $30,000 to $45,000 in its operating account. Freeze it before it moves.',
      events: [
        {
          id: 'grounds', type: 'check', title: 'What you need',
          prompt: '<p>Select everything you need to garnish HCCH’s account at Brazos Prairie Bank after judgment.</p>',
          items: [
            { t: 'A valid, subsisting final judgment against HCCH', ok: true, why: 'Post-judgment garnishment rests on the judgment (CPRC § 63.001(3)).' },
            { t: 'An application with an affidavit saying that, within your knowledge, HCCH doesn’t have property in Texas subject to execution sufficient to satisfy the judgment', ok: true, why: 'That’s the statutory ground (CPRC § 63.001(3); Rule 658).' },
            { t: 'A garnishment case docketed with the bank as defendant (garnishee)', ok: true, why: 'Garnishment is a separate proceeding against the garnishee (Rule 659).' },
            { t: 'A garnishment bond', ok: false, why: 'Rule 658a requires a bond only for garnishment before final judgment.' },
            { t: 'Advance notice to HCCH before the writ issues', ok: false, why: 'The debtor is served after the writ is served on the bank, with the papers Rule 663a requires. Advance notice would empty the account.' }
          ],
          fb: 'Post-judgment garnishment is fast and needs no bond, but the application and affidavit have to track the statute.',
          law: { title: 'Grounds for garnishment', cite: 'Tex. Civ. Prac. & Rem. Code § 63.001(3); Tex. R. Civ. P. 658, 658a, 659',
            text: 'A writ of garnishment is available when the plaintiff has a valid, subsisting judgment and swears that, within its knowledge, the defendant doesn’t have property in Texas subject to execution sufficient to satisfy it.' }
        },
        {
          id: 'tip', type: 'choice', title: 'One last phone call?',
          prompt: '<p>Rosa wants to call Dale before you garnish: <em>"Maybe he’ll just pay."</em> What do you advise?</p>',
          options: [
            { t: 'Make the call. Courtesy first.', g: 'bad', money: { garnish: 1904.17 },
              fb: 'That afternoon, HCCH moves most of its money to an account at another bank. When the writ arrives, the account holds $1,904.17.' },
            { t: 'Serve the writ on the bank first. Then, as soon as practicable, serve HCCH with copies of the writ, application, affidavit, and order, plus the notices Rule 663a requires.', g: 'best', money: { garnish: 38412.55 },
              fb: 'Correct. The writ freezes $38,412.55. HCCH gets prompt notice of its right to move to dissolve the writ and to replevy. Since May 2022, Rule 663a also requires serving the Supreme Court’s Notice of Protected Property Rights, instructions, and claim form, which matter most when the debtor is an individual.' },
            { t: 'Send a 10-day warning letter.', g: 'bad', money: { garnish: 1904.17 },
              fb: 'A warning letter is an invitation to move the money. When the writ arrives, the account holds $1,904.17.' }
          ],
          law: { title: 'Notice to the debtor', cite: 'Tex. R. Civ. P. 663a',
            text: 'As soon as practicable after the writ is served on the garnishee, the defendant must be served with copies of the writ, application, affidavits, and orders; notice of the rights to replevy and to move to dissolve; and, under the 2022 amendments, the Notice of Protected Property Rights, instructions, and Protected Property Claim Form.' }
        },
        {
          id: 'serve-bank', type: 'choice', title: 'Serving the bank',
          prompt: '<p>Where do you serve the writ on Brazos Prairie Bank?</p>',
          options: [
            { t: 'On a teller at the branch where HCCH opened its account.', g: 'bad',
              fb: 'A teller isn’t the bank’s agent for service. Texas law sets specific addresses for serving claims against bank customers.' },
            { t: 'At the address the bank designates for service, usually its registered agent, as Finance Code § 59.008 requires.', g: 'best',
              fb: 'Correct. Served properly, the bank must freeze the account, subject to protections for federal benefits and other exempt funds.' },
            { t: 'By email to the bank’s customer-service address.', g: 'bad',
              fb: 'Email isn’t service of a writ.' }
          ],
          law: { title: 'Serving a financial institution', cite: 'Tex. Fin. Code § 59.008',
            text: 'A writ or other claim against a customer’s account must be served at the address the financial institution has designated for that purpose, such as its registered agent. Service elsewhere may not bind the bank.' }
        },
        {
          id: 'dissolve', type: 'choice', title: 'Motion to dissolve',
          prompt: '<p>HCCH moves to dissolve the writ, arguing your affidavit was false because it owns a trailer and tools. When is the hearing, and who has the burden?</p>',
          options: [
            { t: 'Promptly, with the issue decided within 10 days after the motion is filed. You must prove the grounds you relied on to get the writ.', g: 'best',
              fb: 'Correct. Your affidavit was based on your knowledge, and the trailer’s little equity wouldn’t come close to satisfying the judgment. The writ stands.' },
            { t: 'Within 30 days. HCCH must prove the writ was wrong.', g: 'bad',
              fb: 'Rule 664a puts the burden on the creditor and sets a fast timeline.' },
            { t: 'No hearing. The court rules on the papers.', g: 'bad',
              fb: 'The rule requires a prompt hearing.' }
          ],
          law: { title: 'Dissolving a writ', cite: 'Tex. R. Civ. P. 664a',
            text: 'A defendant may move to dissolve or modify the writ. The motion is heard promptly and decided within 10 days after it’s filed, unless the parties agree otherwise, and the writ is dissolved unless the plaintiff proves the grounds relied on for its issuance.' }
        }
      ]
    },

    /* ================================================================ 10 */
    {
      id: 'exempt', title: 'Exemptions & Execution', date: 'Aug. 10, 2026',
      entry: 'Writ of execution issued',
      intro: 'Texas protects a lot of a debtor’s property. Know what you can reach before you send a constable after it.',
      events: [
        {
          id: 'sort', type: 'sort', pts: 150, title: 'Sort the property',
          prompt: '<p>Put each item in the right bin.</p>',
          bins: [
            { id: 'ex', label: 'Exempt' },
            { id: 'go', label: 'Reachable' },
            { id: 'co', label: 'Charging order only' }
          ],
          items: [
            { t: 'Dale’s homestead on Pecan Street', bin: 'ex', why: 'Homestead is exempt from forced sale for ordinary debts (Tex. Const. art. XVI, § 50; Prop. Code ch. 41). An urban homestead can be up to 10 acres.' },
            { t: 'Dale’s 401(k)', bin: 'ex', why: 'Qualified retirement plans are exempt (Prop. Code § 42.0021), and turnover can’t reach them (CPRC § 31.002(f)).' },
            { t: 'Dale’s pickup and his wife’s SUV', bin: 'ex', why: 'One vehicle per licensed household member is exempt, within the $100,000 family limit for personal property (Prop. Code §§ 42.001(a), 42.002).' },
            { t: 'Two deer rifles', bin: 'ex', why: 'Two firearms are on the exempt list (Prop. Code § 42.002).' },
            { t: 'Cash value of Dale’s whole life policy', bin: 'ex', why: 'Life insurance cash values are exempt (Ins. Code § 1108.051).' },
            { t: 'Dale’s paycheck from HCCH', bin: 'ex', why: 'Current wages for personal services are exempt (Prop. Code § 42.001(b)(1)). The Texas Constitution bars wage garnishment except for child support and spousal maintenance (art. XVI, § 28); federal law separately allows a few, such as for federal taxes and student loans.' },
            { t: 'Vacant lake lot in Granite County', bin: 'go', why: 'It isn’t his homestead, so it’s subject to your judgment lien and execution.' },
            { t: 'Online brokerage account', bin: 'go', why: 'Not exempt. It’s hard to levy on, so turnover is the tool.' },
            { t: 'HCCH’s operating account', bin: 'go', why: 'Chapter 42 protects families and single adults. An LLC has no personal-property exemptions.' },
            { t: 'HCCH’s receivables', bin: 'go', why: 'Not exempt. Reach them through turnover and a receiver.' },
            { t: 'Dale’s 50% interest in Rutledge Lake Rentals, LLC', bin: 'co', why: 'A charging order is the exclusive remedy against a member’s LLC interest (Bus. Orgs. Code § 101.112).' }
          ],
          fb: 'Exemptions belong to individuals and families, not companies. Expect the debtor to come forward with proof when claiming property is exempt.',
          law: { title: 'Texas exemptions', cite: 'Tex. Const. art. XVI, §§ 28, 50; Tex. Prop. Code §§ 41.001–.002, 42.001–.0021',
            text: 'Homesteads, current wages, retirement accounts, and listed personal property (up to $100,000 for a family or $50,000 for a single adult) are exempt from seizure for ordinary debts.' }
        },
        {
          id: 'entity', type: 'choice', title: '"Tools of the trade"',
          prompt: '<p>The constable levies on HCCH’s equipment trailer and tools. HCCH’s lawyer says they’re exempt tools of the trade. Are they?</p>',
          options: [
            { t: 'Yes. Tools of a trade are exempt.', g: 'bad',
              fb: 'Only for a family or a single adult, and only within the aggregate dollar limit.' },
            { t: 'No. Chapter 42 protects property of a family or single adult. An LLC is neither.', g: 'best',
              fb: 'Correct. Business entities don’t get personal-property exemptions. After the lender’s lien on the trailer, there’s little equity, but the levy makes HCCH take you seriously.' },
            { t: 'Only up to $50,000.', g: 'bad',
              fb: 'The $50,000 limit is for a single adult’s personal property. An LLC doesn’t get any exemption.' }
          ],
          law: { title: 'No exemptions for entities', cite: 'Tex. Prop. Code § 42.001(a)',
            text: 'Personal property is exempt only if it is provided for a family or owned by a single adult. Corporations and LLCs can’t claim chapter 42 exemptions.' }
        },
        {
          id: 'sale-date', type: 'date', title: 'Sheriff’s sale date',
          prompt: '<p>Suppose the constable levies on the lake lot on <b>Monday, August 10, 2026</b>, and Dale doesn’t pay. Notice must be published once a week for three straight weeks, the first at least 20 days before the sale. Tap the earliest valid sale date.</p>',
          months: ['2026-08', '2026-09', '2026-10'], marks: ['2026-08-10'], answer: '2026-09-01',
          near: {
            '2026-08-18': 'Execution sales happen only on the first Tuesday of the month.',
            '2026-08-25': 'Execution sales happen only on the first Tuesday of the month.',
            '2026-09-08': 'September 8 is the second Tuesday.',
            '2026-08-31': 'That’s a Monday. Sales are on the first Tuesday.',
            '2026-10-06': 'Valid, but a month later than necessary.'
          },
          partial: ['2026-10-06'],
          fb: 'Real property is sold at the courthouse on the first Tuesday of the month, between 10 a.m. and 4 p.m. Publishing on August 11, 18, and 25 meets the notice rule for <b>September 1</b>.',
          law: { title: 'Execution sales', cite: 'Tex. R. Civ. P. 646a, 647',
            text: 'Real property sold under execution must be sold at the courthouse on the first Tuesday of the month, between 10 a.m. and 4 p.m., after notice published once a week for three consecutive weeks, the first at least 20 days before the sale.' }
        },
        {
          id: 'lot-result', type: 'story', title: 'The lake lot', cta: 'Continue',
          body: (R) => (R('abstract') && R('abstract').money && R('abstract').money.lot)
            ? `<p>Facing a September 1 sale, Dale finds a buyer for the lake lot. The buyer’s title company finds your recorded abstract in Granite County and won’t close without a release. The payoff comes out of the closing proceeds.</p><p class="money">Collected: $61,500.00</p><p>A recorded abstract is leverage. Buyers and lenders won’t take title subject to your lien.</p>`
            : `<p>Dale sold the lake lot in late July, before any levy. With no abstract recorded in Granite County, the title company found no lien, and the $61,500 in proceeds went to Dale. They’re gone.</p><p class="money">Collected: $0.00</p><p>Record abstracts in every county where the debtor owns or may acquire land.</p>`
        }
      ]
    },

    /* ================================================================ 11 */
    {
      id: 'turnover', title: 'Turnover', date: 'Aug. 17, 2026',
      entry: 'Turnover order signed',
      intro: 'Receivables, an out-of-state brokerage account, an LLC interest, and a suspicious boat sale. Some can be reached with turnover; some need a different tool.',
      events: [
        {
          id: 'recv', type: 'choice', title: 'Money owed to HCCH',
          prompt: '<p>Two homeowners owe HCCH about $96,000 in final draws. The constable says he can’t levy on "money somebody else owes." What do you do?</p>',
          options: [
            { t: 'Ask the constable to seize HCCH’s file cabinets instead.', g: 'bad', money: { receivables: 0 },
              fb: 'Paper isn’t the debt. By the time you regroup, both homeowners have paid HCCH, and the money is gone.' },
            { t: 'Move for turnover. Receivables are non-exempt property, including rights to future payment, so the court can apply them to the judgment through a receiver.', g: 'best', money: { receivables: 82140.00 },
              fb: 'Correct. A receiver notifies the homeowners to pay the receiver instead of HCCH. Older cases required showing the property couldn’t readily be levied on by ordinary process; the Legislature removed that element in 2017.' },
            { t: 'Garnish the two homeowners. They owe HCCH money.', g: 'ok', money: { receivables: 41070.00 },
              fb: 'Garnishment can reach debts owed to the judgment debtor, but only debts that are due and not contingent. One homeowner answers that his final draw depends on punch-list work, so only half is caught. A receiver could have handled both.' }
          ],
          law: { title: 'The turnover statute', cite: 'Tex. Civ. Prac. & Rem. Code § 31.002(a)–(b)',
            text: 'A judgment creditor is entitled to court help, through injunction or other means, to reach the debtor’s non-exempt property, including present or future rights to property. The court may order turnover, apply the property to the judgment, or appoint a receiver. Since 2017, the creditor no longer has to show the property can’t readily be levied on.' }
        },
        {
          id: 'brokerage', type: 'choice', title: 'The brokerage account',
          prompt: '<p>Dale’s brokerage account (about $22,600) is held by an online broker with no Texas office. What’s the best way to reach it?</p>',
          options: [
            { t: 'A turnover order requiring Dale to turn over the account and its records, with the receiver authorized to take control and liquidate it.', g: 'best', money: { brokerage: 22618.40 },
              fb: 'Correct. Turnover acts on Dale, who controls the account, wherever the broker is.' },
            { t: 'A writ of execution.', g: 'bad', money: { brokerage: 0 },
              fb: 'A constable can’t levy on an intangible account held by an out-of-state broker. While you wait, Dale moves the account.' },
            { t: 'Wait for Dale to cash it out.', g: 'bad', money: { brokerage: 0 },
              fb: 'He does, and the cash disappears.' }
          ],
          law: { title: 'What turnover can order', cite: 'Tex. Civ. Prac. & Rem. Code § 31.002(b), (e), (h)',
            text: 'The court may order the debtor to turn over non-exempt property in the debtor’s possession or control, along with related documents, to a sheriff or constable; apply the property to the judgment; or appoint a receiver. The order need not identify the specific property, and the creditor may recover reasonable costs, including attorney’s fees.' }
        },
        {
          id: 'llc', type: 'choice', title: 'The rental-cabin LLC',
          prompt: '<p>Dale owns 50% of Rutledge Lake Rentals, LLC, which owns two rental cabins. Can the court turn over the cabins, or Dale’s membership interest, to Bluebonnet?</p>',
          options: [
            { t: 'Yes. Turnover reaches all non-exempt property.', g: 'bad',
              fb: 'The Business Organizations Code limits a member’s creditor to a charging order.' },
            { t: 'No. A charging order is the exclusive remedy. It entitles you to Dale’s share of any distributions, but not the LLC’s assets or the membership interest itself.', g: 'best',
              fb: 'Correct. Ask for a charging order, and keep the expected distributions in mind when you value settlement.' },
            { t: 'Yes, but only the cabins, because the LLC is Dale’s alter ego.', g: 'bad',
              fb: 'Disregarding an LLC requires its own claim and proof. Turnover can’t decide it.' }
          ],
          law: { title: 'Charging orders', cite: 'Tex. Bus. Orgs. Code § 101.112',
            text: 'A charging order is the exclusive remedy by which a judgment creditor of a member may satisfy a judgment out of the member’s LLC interest. The creditor has no right to possess or exercise remedies against the LLC’s property.' }
        },
        {
          id: 'boat', type: 'choice', title: 'The $1 boat',
          prompt: '<p>Dale "sold" his 2023 ski boat to his brother-in-law for $1 in December, after your demand letter. It’s still in Dale’s driveway. What do you do?</p>',
          options: [
            { t: 'Get a turnover order against the brother-in-law.', g: 'bad', money: { boat: 0 },
              fb: 'Turnover is procedural. It can’t decide a third party’s claim of ownership. The order is reversed on appeal, and the boat is sold out of state.' },
            { t: 'Sue under the Texas Uniform Fraudulent Transfer Act. A transfer to an insider, for almost nothing, after a demand, with Dale keeping possession: those are badges of fraud.', g: 'best', money: { boat: 14627.23 },
              fb: 'Correct. Faced with a TUFTA suit, the brother-in-law agrees to an order avoiding the transfer. The constable sells the boat.' },
            { t: 'Let it go. A sale is a sale.', g: 'bad', money: { boat: 0 },
              fb: 'A $1 transfer to a relative after a demand letter deserves a closer look.' }
          ],
          law: { title: 'Fraudulent transfers', cite: 'Tex. Bus. & Com. Code §§ 24.005, 24.008, 24.010; Beaumont Bank, N.A. v. Buller, 806 S.W.2d 223 (Tex. 1991)',
            text: 'A transfer made with intent to hinder, delay, or defraud creditors is voidable. Badges of fraud include transfers to insiders, retained possession, transfers after a threatened suit, and inadequate value. Turnover cannot adjudicate a third party’s substantive rights.' }
        },
        {
          id: 'contempt', type: 'choice', title: 'Dale ignores the order',
          prompt: '<p>The turnover order requires Dale to deliver his brokerage statements and account credentials to the receiver by August 31. He ignores it. What’s next?</p>',
          options: [
            { t: 'Move for contempt. The order must be clear and specific about what Dale must do and when.', g: 'best',
              fb: 'Correct. Faced with a show-cause hearing and possible jail until he complies, Dale delivers everything the morning of the hearing.' },
            { t: 'Ask the constable to arrest him.', g: 'bad',
              fb: 'Only a court can hold Dale in contempt, after notice and a hearing.' },
            { t: 'Nothing. Turnover orders are advisory.', g: 'bad',
              fb: 'They’re enforceable by contempt.' }
          ],
          law: { title: 'Enforcing turnover', cite: 'Tex. Civ. Prac. & Rem. Code § 31.002(c); Ex parte Chambers, 898 S.W.2d 257 (Tex. 1995)',
            text: 'The court may enforce a turnover order by contempt. To support contempt, the order must state clearly, specifically, and unambiguously what the person must do.' }
        }
      ]
    },

    /* ================================================================ 12 */
    {
      id: 'receiver', title: 'The Receiver', date: 'Aug. 24, 2026',
      entry: 'Receiver appointed and qualified',
      intro: 'A receiver is the court’s officer. Pick the right person, qualify them properly, and keep them inside their authority.',
      events: [
        {
          id: 'who', type: 'choice', title: 'Who should serve?',
          prompt: '<p>Who do you nominate as receiver?</p>',
          options: [
            { t: 'Your law partner. She knows the file.', g: 'bad',
              fb: 'The receiver is the court’s officer and owes duties to the debtor too. Chapter 64 bars a party’s attorney, and nominating your own side invites a fight over the appointment.' },
            { t: 'Rosa from Bluebonnet. She’s motivated.', g: 'bad',
              fb: 'A party or other interested person shouldn’t serve as receiver. Chapter 64 bars them.' },
            { t: 'An experienced, disinterested Texas attorney who regularly serves as a turnover receiver.', g: 'best',
              fb: 'Correct. Experience matters: receivers deal with banks, title companies, and debtors who don’t cooperate.' }
          ],
          law: { title: 'Receiver qualifications', cite: 'Tex. Civ. Prac. & Rem. Code § 64.021',
            text: 'Chapter 64 sets receiver qualifications and bars appointing a party, a party’s attorney, or another person interested in the action. Courts have held chapter 64 doesn’t strictly govern turnover receivers, but a neutral, experienced nominee avoids a fight over the appointment.' }
        },
        {
          id: 'qualify', type: 'choice', title: 'Before the receiver acts',
          prompt: '<p>The court signs the order appointing your nominee. What must the receiver do before acting?</p>',
          options: [
            { t: 'Take the oath and post any bond the order requires.', g: 'best',
              fb: 'Correct. Turnover orders typically require an oath, and many set a bond, though courts have treated a bond for a turnover receiver as discretionary. Until the receiver qualifies under the order, banks and title companies may refuse to deal with them.' },
            { t: 'Nothing. The order is self-executing.', g: 'bad',
              fb: 'The receiver has to qualify first.' },
            { t: 'Get Dale’s written consent.', g: 'bad',
              fb: 'Dale’s consent isn’t required.' }
          ],
          law: { title: 'Qualifying', cite: 'Tex. Civ. Prac. & Rem. Code §§ 64.022, 64.023; Tex. R. Civ. P. 695a',
            text: 'Chapter 64 requires a receiver to take an oath and post a bond, and Rule 695a requires the applicant’s bond. For turnover receivers, courts have treated the bond as discretionary, so follow what the appointing order requires before acting.' }
        },
        {
          id: 'powers', type: 'check', title: 'The receiver’s reach',
          prompt: '<p>Which actions are within the receiver’s authority? Select all that apply.</p>',
          items: [
            { t: 'Notify the homeowners to pay HCCH’s final draws to the receiver', ok: true, why: 'Non-exempt receivables are squarely within turnover.' },
            { t: 'Take control of and liquidate Dale’s brokerage account', ok: true, why: 'Non-exempt and covered by the order.' },
            { t: 'Pay the proceeds toward the judgment after court-approved fees and expenses', ok: true, why: 'That’s the receiver’s job under § 31.002(b)(3).' },
            { t: 'Change the locks on Dale’s homestead and list it for sale', ok: false, why: 'Homestead is exempt. The receiver can’t touch it.' },
            { t: 'Roll Dale’s 401(k) into the receivership account', ok: false, why: 'Exempt, and § 31.002(f) bars turnover of exempt property.' },
            { t: 'Rent out the cabins owned by Rutledge Lake Rentals, LLC', ok: false, why: 'Those are the LLC’s assets. A charging order is your only remedy.' },
            { t: 'Seize the car Mrs. Rutledge owned before marriage', ok: false, why: 'Her separate property isn’t liable for Dale’s debts (Fam. Code § 3.202).' }
          ],
          fb: 'A turnover receiver reaches only the judgment debtor’s non-exempt property. Overreaching invites reversal and liability.',
          law: { title: 'Scope of a turnover receiver', cite: 'Tex. Civ. Prac. & Rem. Code § 31.002(b)(3), (f)',
            text: 'The court may appoint a receiver with authority to take possession of non-exempt property, sell it, and pay the proceeds to the judgment creditor to the extent required to satisfy the judgment. For a bank account, the receiver’s rights attach when the bank is served with a certified copy of the order under Fin. Code § 59.008.' }
        },
        {
          id: 'hold', type: 'choice', title: 'Before the receiver pays out',
          prompt: '<p>The receiver has frozen Dale’s brokerage account. Rosa wants the money wired to Bluebonnet today. What has to happen first?</p>',
          options: [
            { t: 'Nothing. The turnover order already decided the account isn’t exempt.', g: 'bad',
              fb: 'Since May 2022, Rule 679b gives debtors a fast way to claim personal property exemptions after property is frozen or seized. Paying out early violates the rule.' },
            { t: 'Serve Dale with the Notice of Protected Property Rights, instructions, and claim form, then wait 14 days (17 if mailed). If Dale files a claim, the court decides it within 10 days.', g: 'best',
              fb: 'Correct. The notice goes out within three business days after the receiver learns the property was frozen or seized. Dale files nothing, and the receiver liquidates the account after the hold period.' },
            { t: 'Wait 30 days so Dale can appeal the turnover order.', g: 'bad',
              fb: 'The waiting period comes from Rule 679b, and it’s 14 days, or 17 if the notice is mailed.' }
          ],
          law: { title: 'Protected-property claims', cite: 'Tex. R. Civ. P. 679b; Tex. Gov’t Code § 22.0042',
            text: 'After a debtor’s property is frozen or seized, the receiver or creditor must serve the Supreme Court’s notice, instructions, and claim form. No sale or distribution may occur within 14 days after service (17 if mailed). If the debtor files a claim, the court holds a hearing and decides it within 10 days.' }
        },
        {
          id: 'bk', type: 'choice', title: 'What if HCCH files bankruptcy?',
          prompt: '<p>The partner asks: <em>"Suppose HCCH files Chapter 7 tomorrow. What changes?"</em></p>',
          options: [
            { t: 'Everything stops against both defendants.', g: 'bad',
              fb: 'The automatic stay protects the debtor in bankruptcy, not a non-debtor guarantor.' },
            { t: 'Collection against HCCH stops, and the receiver turns over HCCH’s property to the trustee. Collection against Dale continues.', g: 'best',
              fb: 'Correct. Watch for preference claims too: transfers to you within 90 days before the filing may be recovered by the trustee.' },
            { t: 'Nothing. State-court receivers are exempt from the stay.', g: 'bad',
              fb: 'A receiver is a "custodian" under the Bankruptcy Code and must turn over the debtor’s property.' }
          ],
          law: { title: 'The automatic stay', cite: '11 U.S.C. §§ 362(a), 543, 547',
            text: 'A bankruptcy filing automatically stays collection against the debtor and its property. A custodian, such as a receiver, must deliver the debtor’s property to the trustee. The stay generally does not protect non-debtor guarantors.' }
        },
        {
          id: 'close', type: 'choice', title: 'Closing the file',
          prompt: '<p>Collections cover the judgment. What closes the file?</p>',
          options: [
            { t: 'Deposit the check.', g: 'bad',
              fb: 'Leaving the judgment unreleased clouds Dale’s title and exposes your client.' },
            { t: 'File a release of judgment, record releases of the abstracts in both counties, and have the receiver file a final report, pay any surplus to Dale, and be discharged.', g: 'best',
              fb: 'Correct. A clean close protects your client and you.' },
            { t: 'Keep the abstracts on record in case Dale owes more later.', g: 'bad',
              fb: 'Once the judgment is paid, the lien must be released.' }
          ],
          law: { title: 'Satisfaction and discharge', cite: 'Tex. Prop. Code ch. 52; Tex. Civ. Prac. & Rem. Code § 34.001',
            text: 'Once a judgment is paid, release it of record so the abstract liens are removed. The receiver accounts to the court, which approves fees and expenses and discharges the receiver. If a judgment isn’t paid, remember that a receivership doesn’t prevent dormancy: a writ of execution must issue within each 10-year period.' }
        }
      ]
    }
  ];

  /* ------------------------------------------------------------------
     Indexing and derived values
     ------------------------------------------------------------------ */
  const EVENT_IDX = {};
  CHAPTERS.forEach((c, ci) => c.events.forEach((e, ei) => {
    if (e.type !== 'story' && !e.pts) e.pts = 100;
    EVENT_IDX[e.id] = { ci, ei };
  }));
  const MAX_SCORE = CHAPTERS.reduce((s, c) => s + c.events.reduce((t, e) => t + (e.type === 'story' ? 0 : e.pts), 0), 0);

  function fresh() { return { v: 1, results: {}, started: false }; }
  let S = load() || fresh();

  function load() {
    try {
      const raw = store.get(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      return s && s.v === 1 && s.results ? s : null;
    } catch (e) { return null; }
  }
  function save() { store.set(SAVE_KEY, JSON.stringify(S)); }
  const R = (id) => S.results[id];

  function score() { return Object.values(S.results).reduce((s, r) => s + (r.pts || 0), 0); }
  function collected() {
    const by = {};
    Object.values(S.results).forEach(r => {
      if (r.money) Object.keys(r.money).forEach(k => { by[k] = r.money[k]; });
    });
    // Lot money is only realized once the lot story has played out.
    if (!R('lot-result')) delete by.lot;
    const total = Object.values(by).reduce((s, n) => s + n, 0);
    return { by, total: Math.min(total, JUDGMENT) };
  }
  const chapterDone = (ci) => CHAPTERS[ci].events.every(e => R(e.id));
  const chapterStarted = (ci) => CHAPTERS[ci].events.some(e => R(e.id));
  function firstOpenChapter() {
    for (let i = 0; i < CHAPTERS.length; i++) if (!chapterDone(i)) return i;
    return -1;
  }
  function chapterGrade(ci) {
    const ev = CHAPTERS[ci].events.filter(e => e.type !== 'story');
    const got = ev.reduce((s, e) => s + ((R(e.id) && R(e.id).pts) || 0), 0);
    const max = ev.reduce((s, e) => s + e.pts, 0);
    return { got, max, f: max ? got / max : 1 };
  }
  const gradeOf = (f) => f >= 0.999 ? 'granted' : f >= 0.5 ? 'partial' : 'denied';
  const STAMP = { granted: 'Granted', partial: 'Granted in part', denied: 'Denied' };
  const STAMP_HTML = { granted: 'Granted', partial: 'Granted<small>in part</small>', denied: 'Denied' };

  const money = (n) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const LETTERS = 'ABCDEFG';
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
  function longDate(s) {
    const d = parseDay(s);
    return `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getUTCDay()]}, ${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  }

  /* ------------------------------------------------------------------
     DOM helpers
     ------------------------------------------------------------------ */
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const view = $('#view');
  const hud = $('#hud');
  let screen = { name: 'title' };

  function show(html, opts = {}) {
    view.innerHTML = html;
    hud.hidden = !opts.hud;
    if (opts.hud) updateHud(opts.where);
    if (!opts.keepScroll) window.scrollTo(0, 0);
    const h = $('h1, h2', view);
    if (h && !opts.noFocus) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  }

  function updateHud(where) {
    $('#hud-k').textContent = where ? where.k : 'Docket';
    $('#hud-v').textContent = where ? where.v : 'Bluebonnet v. Hill Country';
    $('#hud-score').textContent = `${score()} / ${MAX_SCORE}`;
    $('#hud-money').textContent = money(collected().total);
    const open = firstOpenChapter();
    $('#hud-ticks').innerHTML = CHAPTERS.map((c, i) =>
      `<i class="${chapterDone(i) ? 'done' : (i === open ? 'now' : '')}"></i>`).join('');
    $('#nav-arcade').hidden = !IN_ARCADE;
  }

  function captionHTML(extra = '', cls = '') {
    return `<div class="caption ${cls}" role="img" aria-label="Case caption: Bluebonnet Building Supply, Inc. v. Hill Country Custom Homes, LLC and Dale R. Rutledge, in the 501st District Court of Bluebonnet County, Texas">
      <div class="cause">CAUSE NO. 2026-CV-0412</div>
      <div class="grid">
        <div class="party">Bluebonnet Building Supply, Inc.,<div class="role">Plaintiff,</div><div class="vs">v.</div>Hill Country Custom Homes, LLC, and Dale R. Rutledge,<div class="role">Defendants.</div></div>
        <div class="sect" aria-hidden="true">${'<span>§</span>'.repeat(8)}</div>
        <div class="court"><span>In the District Court of</span><span>Bluebonnet County, Texas</span><span>501st Judicial District</span></div>
      </div>
      ${extra}
    </div>`;
  }

  /* ------------------------------------------------------------------
     Screens
     ------------------------------------------------------------------ */
  function showTitle() {
    screen = { name: 'title' };
    const begun = Object.keys(S.results).length > 0;
    const allDone = firstOpenChapter() === -1;
    show(`
      <section class="title-hero fade-in">
        ${captionHTML('<div class="stamp filed">Filed<small>Mar 09 2026</small><small>District Clerk</small></div>', 'with-stamp')}
        <h1>Lone Star <span class="star">Turnover</span></h1>
        <p class="lede">Collect a Texas judgment the hard way: from the original petition, through default and summary judgment, to garnishment, turnover, and a post-judgment receiver.</p>
      </section>
      <div class="stack">
        <div class="row">
          <button class="btn" type="button" id="go-play">${allDone ? 'See the final accounting' : begun ? 'Continue the case' : 'Open the file'}</button>
          <button class="btn ghost" type="button" id="go-book">Casebook</button>
        </div>
        <div class="row">
          <button class="btn quiet" type="button" id="go-how">How it works</button>
          ${begun ? '<button class="btn quiet" type="button" id="go-reset">Start a new case</button>' : ''}
          ${IN_ARCADE ? '<button class="btn quiet" type="button" id="go-arcade">← Back to Arcade</button>' : ''}
        </div>
      </div>
      <p class="fine">A fictional case for learning. The people, companies, county, and court are made up. Rules are summarized as of 2026; check current statutes, rules, and local practice before relying on anything here. This is not legal advice.</p>
    `, { noFocus: true });
    $('#go-play').onclick = () => { S.started = true; save(); allDone ? showFinal() : showDocket(); };
    $('#go-book').onclick = () => showCasebook('title');
    $('#go-how').onclick = showHow;
    if ($('#go-reset')) $('#go-reset').onclick = confirmReset;
    if ($('#go-arcade')) $('#go-arcade').onclick = goArcade;
  }

  function showHow() {
    screen = { name: 'how' };
    show(`
      <article class="sheet fade-in">
        <div class="eyebrow">How it works</div>
        <h2>You represent the creditor</h2>
        <div class="prompt">
          <p>Twelve chapters follow one collection case from intake to a receiver’s discharge. Each chapter is a docket entry. Each decision is a ruling.</p>
          <dl class="facts">
            <div><dt>Rulings</dt><dd>Every answer gets a stamp: <b>Granted</b> (full credit), <b>Granted in part</b> (half credit), or <b>Denied</b>.</dd></div>
            <div><dt>The partner</dt><dd>A legal-pad note explains why, including what the other choices get wrong.</dd></div>
            <div><dt>Casebook</dt><dd>Each decision adds an index card with the rule and citation. Review them any time.</dd></div>
            <div><dt>Collected</dt><dd>Enforcement choices decide how much of the <span class="money">${money(JUDGMENT)}</span> judgment you actually recover.</dd></div>
            <div><dt>Replay</dt><dd>Replay any finished chapter from the docket sheet to improve your score.</dd></div>
          </dl>
        </div>
        <div class="row"><button class="btn" type="button" id="how-back">Got it</button></div>
      </article>
    `);
    $('#how-back').onclick = showTitle;
  }

  function showDocket() {
    screen = { name: 'docket' };
    const open = firstOpenChapter();
    const rows = CHAPTERS.map((c, i) => {
      const done = chapterDone(i);
      const locked = !done && i !== open;
      let chip = '';
      if (done) { const g = gradeOf(chapterGrade(i).f); chip = `<span class="chip ${g}">${STAMP[g]}</span>`; }
      else if (i === open) chip = `<span class="chip next">${chapterStarted(i) ? 'Resume' : 'Next'}</span>`;
      else chip = '<span class="chip locked">Pending</span>';
      return `<button class="docket-row" type="button" data-ci="${i}" ${locked ? 'disabled' : ''}>
        <span class="no">${String(i + 1).padStart(2, '0')}</span>
        <span class="entry"><strong>${c.title}</strong><span>${c.date} · ${c.entry}</span></span>
        ${chip}
      </button>`;
    }).join('');
    const finalRow = open === -1
      ? `<button class="docket-row" type="button" id="final-row"><span class="no">✓</span><span class="entry"><strong>Final accounting</strong><span>Judgment collection results</span></span><span class="chip next">Open</span></button>`
      : '';
    show(`
      <section class="docket fade-in">
        <div class="docket-head">
          <div class="cause">CAUSE NO. 2026-CV-0412 · 501ST DISTRICT COURT</div>
          <h2>Docket sheet</h2>
          <p class="fine">Tap the next entry to work it. Finished entries can be replayed.</p>
        </div>
        ${rows}
        ${finalRow}
      </section>
      <div class="row">
        <button class="btn ghost" type="button" id="dk-book">Casebook</button>
        <button class="btn quiet" type="button" id="dk-title">Title screen</button>
      </div>
    `, { hud: true });
    $$('.docket-row[data-ci]').forEach(b => { b.onclick = () => openChapter(Number(b.dataset.ci)); });
    if ($('#final-row')) $('#final-row').onclick = showFinal;
    $('#dk-book').onclick = () => showCasebook('docket');
    $('#dk-title').onclick = showTitle;
  }

  function openChapter(ci) {
    if (chapterDone(ci)) return confirmReplay(ci);
    const c = CHAPTERS[ci];
    const ei = c.events.findIndex(e => !R(e.id));
    if (ei <= 0) return showChapterIntro(ci);
    showEvent(ci, ei);
  }

  function showChapterIntro(ci) {
    const c = CHAPTERS[ci];
    screen = { name: 'intro', ci };
    show(`
      <article class="sheet fade-in">
        <div class="eyebrow">Chapter ${ci + 1} of ${CHAPTERS.length} · ${c.date}</div>
        <h2>${c.title}</h2>
        <div class="prompt"><p>${c.intro}</p></div>
        <div class="row"><button class="btn" type="button" id="ci-go">Begin</button></div>
      </article>
    `, { hud: true, where: { k: `Chapter ${ci + 1}`, v: c.title } });
    $('#ci-go').onclick = () => showEvent(ci, 0);
  }

  function eventShell(ci, ei, inner, res) {
    const c = CHAPTERS[ci], e = c.events[ei];
    const counted = c.events.filter(x => x.type !== 'story');
    const pos = counted.indexOf(e);
    const g = res && e.type !== 'story' ? gradeOf(res.f) : null;
    return `
      <article class="sheet fade-in" id="ev-sheet">
        ${g ? `<div class="stamp ${g} ${res.fresh ? 'slam' : ''}">${STAMP_HTML[g]}</div>` : ''}
        <div class="eyebrow">Ch. ${ci + 1} · ${c.title}${pos >= 0 ? ` · ${pos + 1} of ${counted.length}` : ''}</div>
        <h2>${e.title}</h2>
        ${inner}
      </article>`;
  }

  function lawCardHTML(e, kicker) {
    return `<article class="lawcard fade-in">
      <div class="head"><span class="kicker">${kicker}</span><h3>${e.law.title}</h3><span class="cite">${e.law.cite}</span></div>
      <p>${e.law.text}</p>
    </article>`;
  }

  function afterHTML(e, res, noteHTML) {
    const pts = `${res.pts} of ${e.pts} points`;
    return `
      <section class="pad fade-in" aria-label="Partner's note">
        <h3>From the partner’s desk · ${pts}</h3>
        ${noteHTML}
      </section>
      ${lawCardHTML(e, 'Added to your casebook')}
      <div class="row end"><button class="btn" type="button" id="ev-next">Next →</button></div>`;
  }

  function showEvent(ci, ei) {
    const c = CHAPTERS[ci], e = c.events[ei];
    screen = { name: 'event', ci, ei };
    const res = R(e.id);
    const where = { k: `Chapter ${ci + 1} · ${c.date}`, v: c.title };
    const render = { story: renderStory, choice: renderChoice, date: renderDate, check: renderCheck, sort: renderSort }[e.type];
    render(ci, ei, e, res, where);
  }

  function next(ci, ei) {
    const c = CHAPTERS[ci];
    if (ei + 1 < c.events.length) showEvent(ci, ei + 1);
    else showChapterSummary(ci);
  }

  function record(e, data) {
    S.results[e.id] = Object.assign({ at: Date.now() }, data);
    save();
  }

  /* ---------- story ---------- */
  function renderStory(ci, ei, e, res, where) {
    show(eventShell(ci, ei, `<div class="prompt">${e.body(R)}</div>
      <div class="row end"><button class="btn" type="button" id="ev-next">${e.cta || 'Continue'} →</button></div>`), { hud: true, where });
    $('#ev-next').onclick = () => {
      if (!res) record(e, { f: 1, pts: 0, story: true });
      updateHud(where);
      next(ci, ei);
    };
  }

  /* ---------- choice ---------- */
  function renderChoice(ci, ei, e, res, where) {
    const answered = !!res;
    const opts = e.options.map((o, i) => {
      let cls = 'opt', tag = '';
      if (answered) {
        if (o.g === 'best') { cls += ' is-best'; tag = 'Best answer'; }
        else if (o.g === 'ok') { cls += ' is-ok'; tag = 'Partly right'; }
        else cls += ' is-bad';
        if (i === res.pick) { cls += ' is-picked'; if (o.g === 'bad') tag = 'Your answer'; }
      }
      return `<button class="${cls}" type="button" data-i="${i}" ${answered ? 'disabled' : ''}>
        <span class="letter" aria-hidden="true">${LETTERS[i]}</span>
        <span>${o.t}${tag ? `<span class="tag">${tag}</span>` : ''}</span>
      </button>`;
    }).join('');
    let after = '';
    if (answered) {
      const picked = e.options[res.pick];
      const bestI = e.options.findIndex(o => o.g === 'best');
      let note = `<p class="verdict">You chose ${LETTERS[res.pick]}.</p><p>${picked.fb}</p>`;
      if (picked.g !== 'best') note += `<p><b>Better: ${LETTERS[bestI]}.</b> ${e.options[bestI].fb}</p>`;
      after = afterHTML(e, res, note);
    }
    show(eventShell(ci, ei, `<div class="prompt">${e.prompt}</div><div class="opts" role="group" aria-label="Choices">${opts}</div>`, res) + after,
      { hud: true, where, keepScroll: answered, noFocus: answered });
    if (!answered) {
      $$('.opt', view).forEach(b => {
        b.onclick = () => {
          const i = Number(b.dataset.i), o = e.options[i];
          const f = o.g === 'best' ? 1 : o.g === 'ok' ? 0.5 : 0;
          record(e, { pick: i, f, pts: Math.round(e.pts * f), money: o.money || null, fresh: true });
          renderChoice(ci, ei, e, R(e.id), where);
          revealFeedback();
        };
      });
    } else {
      $('#ev-next').onclick = () => { delete res.fresh; save(); next(ci, ei); };
    }
  }

  function revealFeedback() {
    updateHud(screen.ci != null ? { k: `Chapter ${screen.ci + 1} · ${CHAPTERS[screen.ci].date}`, v: CHAPTERS[screen.ci].title } : null);
    const pad = $('.pad', view);
    if (pad) {
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      const sheet = $('#ev-sheet', view);
      const offset = (hud.hidden ? 0 : hud.getBoundingClientRect().height) + 12;
      const top = sheet ? sheet.getBoundingClientRect().top + window.scrollY - offset : 0;
      window.scrollTo({ top: Math.max(0, top), behavior: reduce ? 'auto' : 'smooth' });
      const nextBtn = $('#ev-next', view);
      if (nextBtn) nextBtn.focus({ preventScroll: true });
    }
  }

  /* ---------- date ---------- */
  function renderDate(ci, ei, e, res, where, state) {
    const answered = !!res;
    const st = state || { m: answered ? Math.max(0, e.months.indexOf(res.pick.slice(0, 7))) : 0, sel: null };
    const [yy, mm] = e.months[st.m].split('-').map(Number);
    const first = new Date(Date.UTC(yy, mm - 1, 1));
    const days = new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    let cells = DOW.map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < first.getUTCDay(); i++) cells += '<div></div>';
    for (let d = 1; d <= days; d++) {
      const iso = `${yy}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dow = new Date(Date.UTC(yy, mm - 1, d)).getUTCDay();
      let cls = 'cal-day';
      if (dow === 0 || dow === 6) cls += ' wknd';
      if ((e.marks || []).includes(iso)) cls += ' mark';
      if (answered) {
        if (iso === e.answer) cls += ' right';
        else if (iso === res.pick) cls += (res.f > 0 ? ' close' : ' wrong');
      } else if (iso === st.sel) cls += ' sel';
      cells += `<button class="${cls}" type="button" data-d="${iso}" aria-label="${longDate(iso)}" ${answered ? 'disabled' : ''}>${d}</button>`;
    }
    const picked = answered ? res.pick : st.sel;
    const calHTML = `
      <div class="cal">
        <div class="cal-head">
          <button type="button" id="cal-prev" aria-label="Previous month" ${st.m === 0 ? 'disabled' : ''}>‹</button>
          <strong>${MONTHS[mm - 1]} ${yy}</strong>
          <button type="button" id="cal-next" aria-label="Next month" ${st.m === e.months.length - 1 ? 'disabled' : ''}>›</button>
        </div>
        <div class="cal-grid">${cells}</div>
        <div class="cal-legend"><i></i> Dates from the facts</div>
      </div>
      <p class="picked-line" id="picked">${picked ? 'Your date: ' + longDate(picked) : 'Tap a date.'}</p>
      ${answered ? '' : '<div class="row end"><button class="btn" type="button" id="cal-file" ' + (st.sel ? '' : 'disabled') + '>File it</button></div>'}`;
    let after = '';
    if (answered) {
      let note = '';
      if (res.pick === e.answer) note = `<p class="verdict">Right: ${longDate(e.answer)}.</p>`;
      else note = `<p class="verdict">You picked ${longDate(res.pick)}.</p><p>${(e.near && e.near[res.pick]) || 'Not quite. Work through the count below.'}</p>`;
      note += `<p>${e.fb}</p>`;
      after = afterHTML(e, res, note);
    }
    show(eventShell(ci, ei, `<div class="prompt">${e.prompt}</div>${calHTML}`, res) + after,
      { hud: true, where, keepScroll: answered || !!state, noFocus: answered || !!state });
    const rerender = (ns) => renderDate(ci, ei, e, R(e.id), where, ns);
    $('#cal-prev').onclick = () => rerender({ m: st.m - 1, sel: st.sel });
    $('#cal-next').onclick = () => rerender({ m: st.m + 1, sel: st.sel });
    if (!answered) {
      $$('.cal-day', view).forEach(b => { b.onclick = () => rerender({ m: st.m, sel: b.dataset.d }); });
      $('#cal-file').onclick = () => {
        if (!st.sel) return;
        const right = st.sel === e.answer;
        const part = !right && (e.partial || []).includes(st.sel);
        const f = right ? 1 : part ? 0.5 : 0;
        record(e, { pick: st.sel, f, pts: Math.round(e.pts * f), fresh: true });
        renderDate(ci, ei, e, R(e.id), where);
        revealFeedback();
      };
    } else {
      $('#ev-next').onclick = () => { delete res.fresh; save(); next(ci, ei); };
    }
  }

  /* ---------- check (select all that apply) ---------- */
  function renderCheck(ci, ei, e, res, where, picks) {
    const answered = !!res;
    const sel = answered ? res.pick : (picks || []);
    const items = e.items.map((it, i) => {
      const on = sel.includes(i);
      let cls = 'check-item', extra = '';
      if (answered) {
        const right = on === it.ok;
        cls += right ? ' ok' : ' miss';
        const label = it.ok ? (on ? 'Needed ✓' : 'Needed: you missed this') : (on ? 'Not needed' : 'Correctly left out');
        extra = `<span class="verdict">${label}</span><span class="why">${it.why}</span>`;
      }
      return `<button class="${cls}" type="button" data-i="${i}" aria-pressed="${on}" ${answered ? 'disabled' : ''}>
        <span class="box" aria-hidden="true">${on ? '✓' : ''}</span>
        <span>${it.t}${extra ? '<br>' + extra : ''}</span>
      </button>`;
    }).join('');
    let after = '';
    if (answered) {
      const n = e.items.length, right = Math.round(res.f * n);
      after = afterHTML(e, res, `<p class="verdict">${right} of ${n} calls right.</p><p>${e.fb}</p>`);
    }
    show(eventShell(ci, ei, `<div class="prompt">${e.prompt}</div><div class="check">${items}</div>
      ${answered ? '' : '<div class="row end"><button class="btn" type="button" id="ck-file">Submit</button></div>'}`, res) + after,
      { hud: true, where, keepScroll: answered || !!picks, noFocus: answered || !!picks });
    if (!answered) {
      $$('.check-item', view).forEach(b => {
        b.onclick = () => {
          const i = Number(b.dataset.i);
          const ns = sel.includes(i) ? sel.filter(x => x !== i) : sel.concat(i);
          renderCheck(ci, ei, e, null, where, ns);
        };
      });
      $('#ck-file').onclick = () => {
        const right = e.items.filter((it, i) => sel.includes(i) === it.ok).length;
        const f = right / e.items.length;
        record(e, { pick: sel.slice(), f, pts: Math.round(e.pts * f), fresh: true });
        renderCheck(ci, ei, e, R(e.id), where);
        revealFeedback();
      };
    } else {
      $('#ev-next').onclick = () => { delete res.fresh; save(); next(ci, ei); };
    }
  }

  /* ---------- sort ---------- */
  function renderSort(ci, ei, e, res, where, picks) {
    const answered = !!res;
    const sel = answered ? res.pick : (picks || {});
    const items = e.items.map((it, i) => {
      const chosen = sel[i];
      let cls = 'sort-item', why = '';
      if (answered) { cls += chosen === it.bin ? ' ok' : ' miss'; why = `<div class="why">${chosen === it.bin ? '✓ ' : '✗ '}${it.why}</div>`; }
      const bins = e.bins.map(b => {
        const ans = answered && b.id === it.bin ? ' answer' : '';
        return `<button type="button" class="${ans}" data-i="${i}" data-b="${b.id}" aria-pressed="${chosen === b.id}" ${answered ? 'disabled' : ''}>${b.label}</button>`;
      }).join('');
      return `<div class="${cls}"><div class="what">${it.t}</div><div class="bins" role="group" aria-label="${it.t}">${bins}</div>${why}</div>`;
    }).join('');
    const filled = Object.keys(sel).length === e.items.length;
    let after = '';
    if (answered) {
      const right = e.items.filter((it, i) => sel[i] === it.bin).length;
      after = afterHTML(e, res, `<p class="verdict">${right} of ${e.items.length} sorted correctly.</p><p>${e.fb}</p>`);
    }
    show(eventShell(ci, ei, `<div class="prompt">${e.prompt}</div><div class="sort">${items}</div>
      ${answered ? '' : `<div class="row end"><span class="picked-line" style="align-self:center">${Object.keys(sel).length} of ${e.items.length} sorted</span><button class="btn" type="button" id="so-file" ${filled ? '' : 'disabled'}>Submit</button></div>`}`, res) + after,
      { hud: true, where, keepScroll: answered || !!picks, noFocus: answered || !!picks });
    if (!answered) {
      $$('.sort-item .bins button', view).forEach(b => {
        b.onclick = () => {
          const ns = Object.assign({}, sel); ns[b.dataset.i] = b.dataset.b;
          renderSort(ci, ei, e, null, where, ns);
        };
      });
      $('#so-file').onclick = () => {
        const right = e.items.filter((it, i) => sel[i] === it.bin).length;
        const f = right / e.items.length;
        record(e, { pick: Object.assign({}, sel), f, pts: Math.round(e.pts * f), fresh: true });
        renderSort(ci, ei, e, R(e.id), where);
        revealFeedback();
      };
    } else {
      $('#ev-next').onclick = () => { delete res.fresh; save(); next(ci, ei); };
    }
  }

  /* ---------- chapter summary ---------- */
  function showChapterSummary(ci) {
    const c = CHAPTERS[ci];
    screen = { name: 'summary', ci };
    const g = chapterGrade(ci);
    const grade = gradeOf(g.f);
    const list = c.events.filter(e => e.type !== 'story').map(e => {
      const r = R(e.id); const gg = gradeOf(r.f);
      return `<div><span>${e.title}</span><span class="chip ${gg}">${STAMP[gg]}</span></div>`;
    }).join('');
    const last = ci === CHAPTERS.length - 1;
    show(`
      <article class="sheet fade-in">
        <div class="stamp ${grade} slam">${STAMP_HTML[grade]}</div>
        <div class="eyebrow">Chapter ${ci + 1} complete · ${c.date}</div>
        <h2>${c.title}</h2>
        <div class="tally">
          <div><span class="k">Chapter score</span><span class="v">${g.got} / ${g.max}</span></div>
          <div><span class="k">Collected so far</span><span class="v">${money(collected().total)}</span></div>
        </div>
        <div class="results">${list}</div>
        <div class="row">
          <button class="btn" type="button" id="sm-next">${last ? 'Final accounting →' : 'Next chapter →'}</button>
          <button class="btn quiet" type="button" id="sm-docket">Docket sheet</button>
        </div>
      </article>
    `, { hud: true, where: { k: `Chapter ${ci + 1}`, v: c.title } });
    $('#sm-next').onclick = () => {
      const open = firstOpenChapter();
      if (open === -1) showFinal(); else showChapterIntro(open);
    };
    $('#sm-docket').onclick = showDocket;
  }

  /* ---------- final ---------- */
  function rank(f) {
    if (f >= 0.95) return ['Turnover Titan', 'Judges remember your proposed orders because they never need edits.'];
    if (f >= 0.85) return ['Collections Partner', 'Clients send you their hardest files.'];
    if (f >= 0.70) return ['Senior Associate', 'Solid. A few rulings went the other way.'];
    if (f >= 0.50) return ['First-Year Associate', 'You know the map. Replay the denied chapters to learn the shortcuts.'];
    return ['Summer Clerk', 'Every collections lawyer starts here. Open the casebook and run it again.'];
  }

  function showFinal() {
    screen = { name: 'final' };
    const sc = score(), f = sc / MAX_SCORE, col = collected();
    const [title, line] = rank(f);
    const pct = Math.round((col.total / JUDGMENT) * 1000) / 10;
    const satisfied = col.total >= JUDGMENT - 0.005;
    const ledger = Object.keys(SOURCES).map(k =>
      `<div><span>${SOURCES[k].label}</span><span class="money">${money(col.by[k] || 0)}</span></div>`).join('');
    const chapters = CHAPTERS.map((c, i) => {
      const gg = gradeOf(chapterGrade(i).f);
      return `<div><span>${i + 1}. ${c.title}</span><span class="chip ${gg}">${STAMP[gg]}</span></div>`;
    }).join('');
    show(`
      <article class="sheet fade-in">
        <div class="stamp ${satisfied ? 'granted' : col.total > 0 ? 'partial' : 'denied'} slam">${satisfied ? 'Satisfied' : 'Partly paid'}</div>
        <div class="eyebrow">Final accounting</div>
        <h2>${satisfied ? 'Judgment satisfied' : `${pct}% of the judgment collected`}</h2>
        <div class="tally">
          <div><span class="k">Score</span><span class="v">${sc} / ${MAX_SCORE}</span></div>
          <div><span class="k">Collected</span><span class="v">${pct}%</span></div>
          <div><span class="k">Your title</span><span class="v" style="font-size:22px">${title}</span></div>
        </div>
        <p>${line}</p>
        <div class="ledger">
          ${ledger}
          <div class="total"><span>Total toward ${money(JUDGMENT)} judgment</span><span class="money">${money(col.total)}</span></div>
        </div>
        <p class="fine">Post-judgment interest at 18% kept running the whole time, which is why debtors who can pay usually do so sooner rather than later.</p>
        <div class="results">${chapters}</div>
        <div class="row">
          <button class="btn" type="button" id="fn-book">Review the casebook</button>
          <button class="btn ghost" type="button" id="fn-docket">Docket sheet</button>
        </div>
        <div class="row">
          <button class="btn quiet" type="button" id="fn-new">Start a new case</button>
          ${IN_ARCADE ? '<button class="btn quiet" type="button" id="fn-arcade">← Back to Arcade</button>' : ''}
        </div>
      </article>
    `, { hud: false });
    $('#fn-book').onclick = () => showCasebook('final');
    $('#fn-docket').onclick = showDocket;
    $('#fn-new').onclick = confirmReset;
    if ($('#fn-arcade')) $('#fn-arcade').onclick = goArcade;
  }

  /* ---------- casebook ---------- */
  function showCasebook(from) {
    screen = { name: 'casebook', from };
    let unlocked = 0, total = 0;
    const body = CHAPTERS.map((c, i) => {
      const cards = c.events.filter(e => e.law).map(e => {
        total++;
        if (R(e.id)) { unlocked++; return lawCardHTML(e, `Ch. ${i + 1} · ${e.title}`); }
        return `<article class="lawcard locked"><div class="head"><span class="kicker">Ch. ${i + 1}</span><h3>Locked</h3></div><p>Play “${e.title}” to add this card.</p></article>`;
      }).join('');
      return `<h3 class="ch">Chapter ${i + 1} · ${c.title}</h3>${cards}`;
    }).join('');
    show(`
      <section class="stack fade-in">
        <div class="eyebrow">Casebook</div>
        <h2 style="font-size:32px">Rules you’ve collected</h2>
        <p class="fine">${unlocked} of ${total} cards. Short summaries for study; read the full rule or opinion before relying on it.</p>
        <div class="row"><button class="btn" type="button" id="cb-back">← Back</button></div>
      </section>
      <section class="casebook">${body}</section>
      <div class="row"><button class="btn" type="button" id="cb-back2">← Back</button></div>
    `, { hud: from === 'docket', where: { k: 'Casebook', v: `${unlocked} of ${total} cards` } });
    const back = () => from === 'docket' ? showDocket() : from === 'final' ? showFinal() : showTitle();
    $('#cb-back').onclick = back; $('#cb-back2').onclick = back;
  }

  /* ------------------------------------------------------------------
     Modal, navigation, reset
     ------------------------------------------------------------------ */
  let modalAction = null;
  function ask(title, body, goLabel, action) {
    $('#modal-title').textContent = title;
    $('#modal-body').textContent = body;
    $('#modal-go').textContent = goLabel;
    modalAction = action;
    $('#modal').hidden = false;
    $('#modal-stay').focus();
  }
  function closeModal() { $('#modal').hidden = true; modalAction = null; }
  $('#modal-stay').onclick = closeModal;
  $('#modal-go').onclick = () => { const a = modalAction; closeModal(); if (a) a(); };
  $('#modal').addEventListener('click', (ev) => { if (ev.target.id === 'modal') closeModal(); });
  document.addEventListener('keydown', (ev) => { if (ev.key === 'Escape' && !$('#modal').hidden) closeModal(); });

  const midChapter = () => ['event', 'intro'].includes(screen.name);
  function goArcade() { window.location.href = '/'; }
  $('#nav-menu').onclick = () => {
    if (midChapter()) ask('Leave this chapter?', 'Your answers so far are saved. You can pick up where you left off from the docket sheet.', 'Yes, Leave', showDocket);
    else if (screen.name === 'docket') showTitle();
    else showDocket();
  };
  $('#nav-arcade').onclick = () => {
    if (midChapter()) ask('Leave the game?', 'Your answers so far are saved on this device.', 'Yes, Leave', goArcade);
    else goArcade();
  };

  function confirmReplay(ci) {
    ask(`Replay chapter ${ci + 1}?`, `This clears your answers for “${CHAPTERS[ci].title}”, including any money those answers collected, so you can try again. Other chapters keep their results.`, 'Replay', () => {
      CHAPTERS[ci].events.forEach(e => { delete S.results[e.id]; });
      save();
      showChapterIntro(ci);
    });
  }
  function confirmReset() {
    ask('Start a new case?', 'This clears every answer, your score, and your casebook on this device.', 'Start over', () => {
      S = fresh(); save(); showTitle();
    });
  }

  /* ------------------------------------------------------------------
     Boot (with the artifact viewer's hot-reload hook when present)
     ------------------------------------------------------------------ */
  function resume(sc) {
    if (!sc || !sc.name) return showTitle();
    if (sc.name === 'event' && CHAPTERS[sc.ci] && CHAPTERS[sc.ci].events[sc.ei]) return showEvent(sc.ci, sc.ei);
    if (sc.name === 'intro' && CHAPTERS[sc.ci]) return showChapterIntro(sc.ci);
    if (sc.name === 'summary' && CHAPTERS[sc.ci] && chapterDone(sc.ci)) return showChapterSummary(sc.ci);
    if (sc.name === 'docket') return showDocket();
    if (sc.name === 'final' && firstOpenChapter() === -1) return showFinal();
    if (sc.name === 'casebook') return showCasebook(sc.from);
    return showTitle();
  }
  function start(data) {
    if (data && data.S && data.S.v === 1) { S = data.S; save(); }
    resume(data && data.screen);
  }
  const hot = window.claude && window.claude.hot;
  if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ S, screen }));
  if (hot && typeof hot.ready === 'function') hot.ready(start);
  else start((hot && hot.data) || {});
})();
