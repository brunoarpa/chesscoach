#!/usr/bin/env node
// GA4 Data API reporting tool for the elochaser property.
//
// Auth model: you log in once locally with
//   gcloud auth application-default login
// This script uses those credentials to impersonate the ga4-reader service
// account (which has Viewer on the GA4 property). No key file is ever used.
//
// Usage examples:
//   node index.mjs                                  # active/new users + sessions, last 7 days by date
//   node index.mjs --metrics activeUsers --start 28daysAgo --end today
//   node index.mjs --dimensions country --metrics activeUsers --start 30daysAgo
//   node index.mjs --dimensions pagePath --metrics screenPageViews --limit 20
//   node index.mjs --realtime --metrics activeUsers --dimensions country
//   node index.mjs --json                           # raw JSON output
//
// Flags:
//   --property <id>   GA4 property id            (default 543886783 = elochaser)
//   --metrics a,b     comma-separated metrics    (default activeUsers,newUsers,sessions)
//   --dimensions a,b  comma-separated dimensions (default date)
//   --start <date>    start date / NdaysAgo      (default 7daysAgo)
//   --end <date>      end date                   (default today)
//   --limit <n>       max rows                   (default 100)
//   --realtime        use the realtime report (last 30 min); ignores start/end
//   --json            print raw JSON instead of a table

import { GoogleAuth, Impersonated } from 'google-auth-library';
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const SERVICE_ACCOUNT = 'ga4-reader@chesscoach-493818.iam.gserviceaccount.com';
const DEFAULT_PROPERTY = '543886783'; // elochaser

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next === undefined || next.startsWith('--')) {
        args[key] = true; // boolean flag
      } else {
        args[key] = next;
        i++;
      }
    } else {
      args._.push(a);
    }
  }
  return args;
}

function toList(v, fallback) {
  if (v === undefined) return fallback;
  return String(v)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function getClient() {
  const auth = new GoogleAuth({
    scopes: ['https://www.googleapis.com/auth/cloud-platform'],
  });
  const sourceClient = await auth.getClient();
  const targetClient = new Impersonated({
    sourceClient,
    targetPrincipal: SERVICE_ACCOUNT,
    lifetime: 3600,
    delegates: [],
    targetScopes: ['https://www.googleapis.com/auth/analytics.readonly'],
  });
  return new BetaAnalyticsDataClient({ authClient: targetClient });
}

function printTable(header, rows) {
  if (rows.length === 0) {
    console.log('(no rows)');
    return;
  }
  const widths = header.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => String(r[i] ?? '').length))
  );
  const fmt = (cells) =>
    cells.map((c, i) => String(c ?? '').padEnd(widths[i])).join('  ');
  console.log(fmt(header));
  console.log(widths.map((w) => '-'.repeat(w)).join('  '));
  for (const r of rows) console.log(fmt(r));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const property = `properties/${args.property || DEFAULT_PROPERTY}`;
  const metrics = toList(args.metrics, ['activeUsers', 'newUsers', 'sessions']);
  const dimensions = toList(args.dimensions, args.realtime ? [] : ['date']);
  const limit = Number(args.limit || 100);

  // --event <name> restricts the report to a single GA4 event.
  const dimensionFilter = args.event
    ? { filter: { fieldName: 'eventName', stringFilter: { value: String(args.event) } } }
    : undefined;

  const client = await getClient();

  let response;
  if (args.realtime) {
    [response] = await client.runRealtimeReport({
      property,
      metrics: metrics.map((name) => ({ name })),
      dimensions: dimensions.map((name) => ({ name })),
      dimensionFilter,
      limit,
    });
  } else {
    [response] = await client.runReport({
      property,
      dateRanges: [
        { startDate: args.start || '7daysAgo', endDate: args.end || 'today' },
      ],
      metrics: metrics.map((name) => ({ name })),
      dimensions: dimensions.map((name) => ({ name })),
      dimensionFilter,
      limit,
    });
  }

  if (args.json) {
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const dimHeaders = (response.dimensionHeaders || []).map((h) => h.name);
  const metHeaders = (response.metricHeaders || []).map((h) => h.name);
  const header = [...dimHeaders, ...metHeaders];
  const rows = (response.rows || []).map((row) => [
    ...(row.dimensionValues || []).map((v) => v.value),
    ...(row.metricValues || []).map((v) => v.value),
  ]);

  printTable(header, rows);
  console.log(
    `\n${rows.length} row(s) | property ${property.replace('properties/', '')} | ${
      args.realtime ? 'realtime (last 30 min)' : `${args.start || '7daysAgo'} -> ${args.end || 'today'}`
    }`
  );
}

main().catch((err) => {
  const msg = String(err?.message || err);
  console.error('\nGA4 query failed:\n  ' + msg + '\n');
  if (/Could not load the default credentials|application default/i.test(msg)) {
    console.error(
      'Looks like local credentials are not set up. Run:\n' +
        '  gcloud auth application-default login\n'
    );
  } else if (/permission|PERMISSION_DENIED|IAM|token/i.test(msg)) {
    console.error(
      'Auth reached Google but was rejected. Check that:\n' +
        `  - you are logged in as an account with Token Creator on ${SERVICE_ACCOUNT}\n` +
        '  - the IAM Service Account Credentials API is enabled\n' +
        '  - the service account has Viewer on the GA4 property\n' +
        '(these can take a few minutes to propagate after setup)\n'
    );
  }
  process.exit(1);
});
