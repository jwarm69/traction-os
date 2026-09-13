import { createClient } from '@libsql/client/web';

const required = (name) => {
  const value = process.env[name];
  if (!value) throw Error(`${name} is required.`);
  return value;
};
const ownerEmail = required('OWNER_EMAIL');
const now = new Date().toISOString();
const business = {
  version: 2,
  id: 'biz_owner_bite_club',
  name: 'Bite Club Meal Plan',
  url: 'https://biteclubmealplan.com',
  mode: 'live',
  createdAt: now,
  updatedAt: now,
  goal: 'Preserve the UF learning and decide whether FAU or FSU deserves the next bounded validation when work resumes.',
  budget: 'Paused: no owner hours or spend committed until reactivation.',
  notes:
    'Bite Club is intentionally kept in the portfolio while paused. Campus progress must be evaluated separately; evidence from UF does not establish traction at FAU or FSU.',
  portfolio: {
    priority: 'paused',
    ownerHours: 0,
    note: 'Paused, but retained because the UF operating history and multi-campus product foundation are strategically valuable.',
    updatedAt: now,
  },
  marketLabel: 'Campus',
  markets: [
    {
      id: 'market_bite_club_uf',
      name: 'University of Florida',
      code: 'UF',
      location: 'Gainesville, Florida',
      status: 'traction',
      objective:
        'Reconcile the existing UF baseline and identify the smallest repeatable campus operating loop.',
      evidence:
        'Owner reports progress at UF. The product repository contains a UF relaunch tracker and Gainesville/UF operating flows; current user, order, partner, and revenue metrics still need owner confirmation.',
      nextMove:
        'When reactivated, record current UF students, active restaurant partners, orders, credit volume, and the dates those observations cover.',
      updatedAt: now,
    },
    {
      id: 'market_bite_club_fau',
      name: 'Florida Atlantic University',
      code: 'FAU',
      location: 'Boca Raton, Florida',
      status: 'validating',
      objective:
        'Determine whether FAU is the strongest next campus before committing launch resources.',
      evidence:
        'The product has a multi-campus data foundation and references FAU as an expansion market. No FAU-specific traction outcome is recorded here yet.',
      nextMove:
        'Compare reachable restaurant supply, student distribution access, an on-campus operator, and a five-conversation demand sample.',
      updatedAt: now,
    },
    {
      id: 'market_bite_club_fsu',
      name: 'Florida State University',
      code: 'FSU',
      location: 'Tallahassee, Florida',
      status: 'validating',
      objective:
        'Determine whether FSU is the strongest next campus before committing launch resources.',
      evidence:
        'The product repository identifies FSU as a possible Florida expansion campus. No FSU-specific traction outcome is recorded here yet.',
      nextMove:
        'Compare reachable restaurant supply, student distribution access, an on-campus operator, and a five-conversation demand sample.',
      updatedAt: now,
    },
  ],
  facts: [
    {
      id: 'fact_bite_club_offer',
      label: 'Offer',
      value:
        'A student campus food-ordering platform where students buy credits, browse local restaurant menus, and place pickup orders.',
      source: 'bite-club-unified README, reviewed September 11, 2026',
      observedAt: now,
      confidence: 'high',
      status: 'unreviewed',
    },
    {
      id: 'fact_bite_club_product',
      label: 'Product foundation',
      value:
        'The repository contains student, restaurant, admin, and campus-manager experiences plus a multi-campus database foundation.',
      source:
        'bite-club-unified README and codebase map, reviewed September 11, 2026',
      observedAt: now,
      confidence: 'high',
      status: 'unreviewed',
    },
    {
      id: 'fact_bite_club_boundary',
      label: 'Campus evidence boundary',
      value:
        'Progress at UF must not be treated as evidence of traction at FAU, FSU, or any other campus.',
      source: 'Owner direction in this task',
      observedAt: now,
      confidence: 'high',
      status: 'confirmed',
    },
  ],
  signals: [],
  rounds: [],
  reviews: [],
  outreach: { prospects: [], drafts: [] },
  log: [
    {
      text: 'Bite Club added as a paused portfolio business with separate UF, FAU, and FSU campus records.',
      at: now,
    },
  ],
};

const client = createClient({
  url: required('TURSO_DATABASE_URL'),
  authToken: required('TURSO_AUTH_TOKEN'),
});
try {
  await client.execute({
    sql: 'INSERT INTO owner_starters(owner_email,business_id,data) VALUES(?,?,?) ON CONFLICT(owner_email,business_id) DO UPDATE SET data=excluded.data',
    args: [ownerEmail.toLowerCase(), business.id, JSON.stringify(business)],
  });
  console.log(
    JSON.stringify({
      saved: business.name,
      priority: business.portfolio.priority,
      campuses: business.markets.map((market) => market.code),
    }),
  );
} finally {
  client.close();
}
