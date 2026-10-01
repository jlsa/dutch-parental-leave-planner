# Parental Leave Planner (Netherlands)

A small web app that helps a **partner (non-birthing parent) in the Netherlands** plan their leave during the first year after a child is born. Enter the birth date and your working hours, and it schedules everything day by day, checks the legal deadlines and shows the result as a timeline and a year calendar.

> **Note:** this is a Dutch tool. The interface is in Dutch and the calculations follow Dutch leave rules (*geboorteverlof*, *aanvullend geboorteverlof* and *betaald ouderschapsverlof*). It is not useful for leave schemes in other countries.

## What it plans

| Leave (Dutch name) | Amount | Deadline | Paid by |
| --- | --- | --- | --- |
| Birth leave (*geboorteverlof*) | 1× your weekly hours | within 4 weeks after birth | employer, 100% |
| Additional birth leave (*aanvullend geboorteverlof*) | up to 5× your weekly hours, only after birth leave is used | within 6 months after birth | UWV, 70% of daily wage (capped) |
| Paid parental leave (*betaald ouderschapsverlof*) | 9× your weekly hours, taken as fewer hours per day | within the first year | UWV, 70% of daily wage (capped) |

All amounts are based on your own contract hours, so a 32-hour week gives 32 hours of birth leave, 160 hours of additional leave and 288 hours of paid parental leave.

## Features

- Enter the birth date and your working hours per weekday; everything else is calculated.
- Choose the start date and hours per day for each type of leave, or keep the defaults (each one starts right after the previous one).
- Spread paid parental leave as a few hours less per working day.
- Dutch public holidays are skipped automatically (optional).
- Add vacation days, a single day or a period; leave is not used on those days and the schedule shifts accordingly.
- Warnings when leave does not fit within its legal deadline.
- Timeline of the first year and a full year calendar showing (partial) leave days.
- Settings are stored in your browser (`localStorage`); nothing is sent anywhere.
- Share your plan with a link (e.g. with your manager or HR): the whole plan is stored in the part of the URL after `#`, which browsers never send to a server.
- Print-friendly layout.

## Getting started

Requires Node.js 20.19+ or 22.12+.

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

Other scripts:

```bash
npm test        # run the calculation tests (Vitest)
npm run build   # type-check and build to dist/
```

## Project structure

```
src/
  plan.ts        leave rules and scheduling logic
  plan.test.ts   tests for the scheduling logic
  holidays.ts    Dutch public holidays
  dates.ts       timezone-safe date helpers
  main.ts        UI rendering and form handling
  style.css      styles (light and dark mode)
```

Built with TypeScript and Vite, without a UI framework.

## Disclaimer

This is a planning aid, not legal or financial advice. Rules and benefit percentages can change; always check the current rules at [UWV](https://www.uwv.nl) and [Rijksoverheid](https://www.rijksoverheid.nl) and agree on your schedule with your employer.
