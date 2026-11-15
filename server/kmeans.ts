import type { ClusterProfile, CustomerRecord, KMeansModelArtifact } from './types.ts';

export const KMEANS_FEATURE_COLUMNS: string[] = [
  'total_visits',
  'total_spend_inr',
  'avg_spend_per_visit_inr',
  'spend_per_person',
  'avg_group_size',
  'days_since_last_visit',
  'expected_visit_gap',
  'overdue_ratio',
  'chicken_share',
  'veg_share',
  'mutton_share',
  'seafood_share',
  'biryani_rice_share',
  'chinese_fastfood_share',
  'dessert_beverage_share',
];

export const CANONICAL_CLUSTER_META: Record<number, { name: string; subtitle: string }> = {
  0: {
    name: 'Frequent Visitors',
    subtitle: 'Regular diners with strong repeat-visit loyalty',
  },
  1: {
    name: 'Premium Customers',
    subtitle: 'High-spending guests who appreciate curated dining',
  },
  2: {
    name: 'Family Visitors',
    subtitle: 'Larger group & weekend celebration diners',
  },
  3: {
    name: 'Occasional Customers',
    subtitle: 'Single-visit guests ready to be welcomed back',
  },
};

function extractFeatureVector(c: CustomerRecord): number[] {
  const totalFood = Math.max(
    1,
    c.chicken_orders +
      c.veg_orders +
      c.mutton_orders +
      c.seafood_orders +
      c.biryani_rice_orders +
      c.chinese_fastfood_orders +
      c.dessert_beverage_orders
  );

  return [
    c.total_visits,
    c.total_spend_inr,
    c.avg_spend_per_visit_inr,
    c.spend_per_person,
    c.avg_group_size,
    c.days_since_last_visit,
    c.expected_visit_gap,
    c.overdue_ratio,
    c.chicken_orders / totalFood,
    c.veg_orders / totalFood,
    c.mutton_orders / totalFood,
    c.seafood_orders / totalFood,
    c.biryani_rice_orders / totalFood,
    c.chinese_fastfood_orders / totalFood,
    c.dessert_beverage_orders / totalFood,
  ];
}

function sqDist(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return sum;
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function runSingleKMeans(
  X: number[][],
  k: number,
  rand: () => number,
  maxIter = 60
): {
  labels: number[];
  centroids: number[][];
  inertia: number;
} {
  const n = X.length;
  const dims = X[0].length;
  const centroids: number[][] = [];
  const firstIdx = Math.floor(rand() * n);
  centroids.push([...X[firstIdx]]);

  const minDists = new Array<number>(n).fill(Infinity);
  for (let c = 1; c < k; c++) {
    let totalWeight = 0;
    for (let i = 0; i < n; i++) {
      const d = sqDist(X[i], centroids[c - 1]);
      if (d < minDists[i]) minDists[i] = d;
      totalWeight += minDists[i];
    }
    let nextIdx = 0;
    if (totalWeight > 0) {
      let target = rand() * totalWeight;
      for (let i = 0; i < n; i++) {
        target -= minDists[i];
        if (target <= 0) {
          nextIdx = i;
          break;
        }
      }
    } else {
      nextIdx = Math.floor(rand() * n);
    }
    centroids.push([...X[nextIdx]]);
  }

  const labels = new Array<number>(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let bestC = 0;
      let bestD = Infinity;
      for (let c = 0; c < k; c++) {
        const d = sqDist(X[i], centroids[c]);
        if (d < bestD) {
          bestD = d;
          bestC = c;
        }
      }
      if (labels[i] !== bestC) {
        labels[i] = bestC;
        changed = true;
      }
    }

    const sums: number[][] = Array.from({ length: k }, () => new Array<number>(dims).fill(0));
    const counts = new Array<number>(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      counts[c]++;
      for (let d = 0; d < dims; d++) {
        sums[c][d] += X[i][d];
      }
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dims; d++) {
          centroids[c][d] = sums[c][d] / counts[c];
        }
      }
    }
    if (!changed) break;
  }

  let inertia = 0;
  for (let i = 0; i < n; i++) {
    inertia += sqDist(X[i], centroids[labels[i]]);
  }

  return { labels, centroids, inertia };
}

function runKMeansCore(X: number[][], k: number, restarts = 12): {
  labels: number[];
  centroids: number[][];
  inertia: number;
} {
  const rand = createSeededRandom(20261114 + k);
  let best: { labels: number[]; centroids: number[][]; inertia: number } | null = null;
  for (let r = 0; r < restarts; r++) {
    const candidate = runSingleKMeans(X, k, rand);
    if (!best || candidate.inertia < best.inertia) {
      best = candidate;
    }
  }
  return best!;
}

function computeSilhouette(X: number[][], labels: number[], k: number): number {
  const totalN = X.length;
  if (totalN <= k || k < 2) return 0;

  const maxSample = 400;
  const step = totalN > maxSample ? totalN / maxSample : 1;
  const sampleIndices: number[] = [];
  for (let idx = 0; idx < totalN; idx += step) {
    sampleIndices.push(Math.floor(idx));
  }
  const m = sampleIndices.length;

  let totalS = 0;
  for (let si = 0; si < m; si++) {
    const i = sampleIndices[si];
    const ci = labels[i];
    let aSum = 0;
    let aCount = 0;
    const bSums = new Array<number>(k).fill(0);
    const bCounts = new Array<number>(k).fill(0);

    for (let sj = 0; sj < m; sj++) {
      if (si === sj) continue;
      const j = sampleIndices[sj];
      const dist = Math.sqrt(sqDist(X[i], X[j]));
      const cj = labels[j];
      if (cj === ci) {
        aSum += dist;
        aCount++;
      } else {
        bSums[cj] += dist;
        bCounts[cj]++;
      }
    }
    const a = aCount > 0 ? aSum / aCount : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c !== ci && bCounts[c] > 0) {
        const avg = bSums[c] / bCounts[c];
        if (avg < b) b = avg;
      }
    }
    if (!Number.isFinite(b)) b = a;
    const denom = Math.max(a, b);
    totalS += denom > 0 ? (b - a) / denom : 0;
  }
  return Number((totalS / m).toFixed(4));
}

function assignRepeatClusterNames(
  customers: CustomerRecord[],
  rawLabels: number[],
  k: number
): {
  canonicalLabels: number[];
  canonicalRemap: number[];
} {
  const groups = Array.from({ length: k }, (_, cid) => {
    const members = customers.filter((_, idx) => rawLabels[idx] === cid);
    const n = Math.max(1, members.length);
    return {
      rawId: cid,
      avgSpendPerVisit: members.reduce((s, m) => s + m.avg_spend_per_visit_inr, 0) / n,
      avgGroupSize: members.reduce((s, m) => s + m.avg_group_size, 0) / n,
    };
  });

  const assignedRaw = new Set<number>();
  const rawToCanonical = new Map<number, number>();

  // 1) Highest avg spend per visit -> Premium Customers (1)
  const premium = [...groups].sort((a, b) => b.avgSpendPerVisit - a.avgSpendPerVisit)[0];
  rawToCanonical.set(premium.rawId, 1);
  assignedRaw.add(premium.rawId);

  // 2) Highest group size among remaining -> Family Visitors (2)
  const family = [...groups]
    .filter((g) => !assignedRaw.has(g.rawId))
    .sort((a, b) => b.avgGroupSize - a.avgGroupSize)[0];
  if (family) {
    rawToCanonical.set(family.rawId, 2);
    assignedRaw.add(family.rawId);
  }

  // 3) Remaining -> Frequent Visitors (0)
  for (const g of groups) {
    if (!assignedRaw.has(g.rawId)) {
      rawToCanonical.set(g.rawId, 0);
      assignedRaw.add(g.rawId);
    }
  }

  const canonicalRemap = new Array<number>(k).fill(0);
  rawToCanonical.forEach((canon, raw) => {
    canonicalRemap[canon] = raw;
  });

  const canonicalLabels = rawLabels.map((r) => rawToCanonical.get(r) ?? 0);
  return { canonicalLabels, canonicalRemap };
}

function classifyRepeatGuestFallback(c: CustomerRecord, medianSpend: number): number {
  if (c.avg_spend_per_visit_inr >= medianSpend * 1.35) return 1; // Premium
  if (c.avg_group_size >= 3.0) return 2; // Family
  return 0; // Frequent
}

export function trainKMeansModel(customers: CustomerRecord[], nClusters = 4): {
  model: KMeansModelArtifact;
  assignedCustomers: CustomerRecord[];
} {
  const dims = KMEANS_FEATURE_COLUMNS.length;
  const now = new Date();
  const modelVersion = `km_${now.toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`;

  if (customers.length === 0) {
    return {
      model: {
        model_version: modelVersion,
        trained_at: now.toISOString(),
        n_clusters: nClusters,
        feature_columns: KMEANS_FEATURE_COLUMNS,
        means: new Array<number>(dims).fill(0),
        stds: new Array<number>(dims).fill(1),
        centroids: Array.from({ length: 3 }, () => new Array<number>(dims).fill(0)),
        cluster_label_map: CANONICAL_CLUSTER_META,
        silhouette_score: 0,
        inertia: 0,
        elbow_inertias: {},
        training_sample_count: 0,
      },
      assignedCustomers: [],
    };
  }

  // Single-visit guests -> Cluster 3 (Occasional Customers)
  // Repeat guests -> 3-cluster K-Means++ (0: Frequent, 1: Premium, 2: Family)
  const repeatCustomers = customers.filter((c) => c.total_visits > 1);
  const repeatClustersCount = 3;

  const scalingSource = repeatCustomers.length >= repeatClustersCount ? repeatCustomers : customers;
  const rawMatrix = scalingSource.map((c) => extractFeatureVector(c));
  const means = new Array<number>(dims).fill(0);
  const stds = new Array<number>(dims).fill(1);

  for (let d = 0; d < dims; d++) {
    const col = rawMatrix.map((row) => row[d]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const variance = col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length;
    means[d] = mean;
    stds[d] = Math.sqrt(variance) || 1;
  }

  const repeatIdToCluster = new Map<string, number>();
  let silhouette = 0;
  let inertia = 0;
  const elbowInertias: Record<string, number> = {};
  let orderedCentroids: number[][] = Array.from({ length: 3 }, () => new Array<number>(dims).fill(0));

  if (repeatCustomers.length >= repeatClustersCount) {
    const XScaled = repeatCustomers.map((c) => {
      const vec = extractFeatureVector(c);
      return vec.map((v, d) => (v - means[d]) / stds[d]);
    });

    for (let k = 2; k <= Math.min(5, repeatCustomers.length - 1); k++) {
      const evalRes = runKMeansCore(XScaled, k);
      elbowInertias[String(k)] = Number(evalRes.inertia.toFixed(2));
    }

    const trained = runKMeansCore(XScaled, repeatClustersCount);
    silhouette = computeSilhouette(XScaled, trained.labels, repeatClustersCount);
    inertia = Number(trained.inertia.toFixed(2));

    const { canonicalLabels, canonicalRemap } = assignRepeatClusterNames(
      repeatCustomers,
      trained.labels,
      repeatClustersCount
    );

    orderedCentroids = canonicalRemap.map((rawIdx) => trained.centroids[rawIdx]);
    repeatCustomers.forEach((c, idx) => {
      repeatIdToCluster.set(c.customer_id, canonicalLabels[idx]);
    });
  } else {
    const spends = customers.map((c) => c.avg_spend_per_visit_inr).sort((a, b) => a - b);
    const medianSpend = spends[Math.floor(spends.length / 2)] || 500;
    for (const c of repeatCustomers) {
      repeatIdToCluster.set(c.customer_id, classifyRepeatGuestFallback(c, medianSpend));
    }
  }

  const assignedCustomers = customers.map((c) => {
    const cid = c.total_visits <= 1 ? 3 : repeatIdToCluster.get(c.customer_id) ?? 0;
    return {
      ...c,
      cluster_id: cid,
      cluster_name: CANONICAL_CLUSTER_META[cid]?.name || `Group ${cid + 1}`,
    };
  });

  const model: KMeansModelArtifact = {
    model_version: modelVersion,
    trained_at: now.toISOString(),
    n_clusters: 4,
    feature_columns: KMEANS_FEATURE_COLUMNS,
    means,
    stds,
    centroids: orderedCentroids,
    cluster_label_map: CANONICAL_CLUSTER_META,
    silhouette_score: silhouette,
    inertia,
    elbow_inertias: elbowInertias,
    training_sample_count: customers.length,
  };

  return { model, assignedCustomers };
}

export function predictCustomerCluster(
  customer: CustomerRecord,
  model: KMeansModelArtifact
): { cluster_id: number; cluster_name: string } {
  if (customer.total_visits <= 1) {
    return {
      cluster_id: 3,
      cluster_name: CANONICAL_CLUSTER_META[3].name,
    };
  }

  const vec = extractFeatureVector(customer);
  const scaled = vec.map((v, d) => (v - (model.means[d] ?? 0)) / (model.stds[d] || 1));

  let bestCid = 0;
  let bestDist = Infinity;
  for (let cid = 0; cid < model.centroids.length; cid++) {
    const d = sqDist(scaled, model.centroids[cid]);
    if (d < bestDist) {
      bestDist = d;
      bestCid = cid;
    }
  }
  return {
    cluster_id: bestCid,
    cluster_name:
      model.cluster_label_map[bestCid]?.name ||
      CANONICAL_CLUSTER_META[bestCid]?.name ||
      `Group ${bestCid + 1}`,
  };
}

export function buildClusterProfiles(
  customers: CustomerRecord[],
  model: KMeansModelArtifact
): ClusterProfile[] {
  const totalCustomers = Math.max(1, customers.length);
  const overallAvgSpend =
    customers.reduce((s, c) => s + c.avg_spend_per_visit_inr, 0) / totalCustomers;
  const overallAvgVisits =
    customers.reduce((s, c) => s + c.total_visits, 0) / totalCustomers;

  const profiles: ClusterProfile[] = [];
  const clusterCount = 4;

  for (let cid = 0; cid < clusterCount; cid++) {
    const list = customers.filter((c) => c.cluster_id === cid);
    const count = list.length;
    const n = Math.max(1, count);
    const meta = model.cluster_label_map[cid] || CANONICAL_CLUSTER_META[cid] || {
      name: `Group ${cid + 1}`,
      subtitle: 'Guest segment',
    };

    const totalRev = list.reduce((s, c) => s + c.total_spend_inr, 0);
    const avgTotalSpend = count > 0 ? totalRev / n : 0;
    const avgSpendPerVisit =
      count > 0 ? list.reduce((s, c) => s + c.avg_spend_per_visit_inr, 0) / n : 0;
    const avgVisits = count > 0 ? list.reduce((s, c) => s + c.total_visits, 0) / n : 0;
    const avgGroupSize = count > 0 ? list.reduce((s, c) => s + c.avg_group_size, 0) / n : 0;
    const highAlertsCount = list.filter((c) => c.churn_alert_flag === 'HIGH_PRIORITY_ALERT').length;
    const alertPct = count > 0 ? (highAlertsCount / n) * 100 : 0;

    const catTotals: Record<string, number> = {
      Chicken: list.reduce((s, c) => s + c.chicken_orders, 0),
      Veg: list.reduce((s, c) => s + c.veg_orders, 0),
      Mutton: list.reduce((s, c) => s + c.mutton_orders, 0),
      Seafood: list.reduce((s, c) => s + c.seafood_orders, 0),
      'Biryani & Rice': list.reduce((s, c) => s + c.biryani_rice_orders, 0),
      'Chinese & Fast Food': list.reduce((s, c) => s + c.chinese_fastfood_orders, 0),
      'Dessert & Beverage': list.reduce((s, c) => s + c.dessert_beverage_orders, 0),
    };
    const topFoodCat =
      Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Chicken';

    const mealFreq: Record<string, number> = {};
    const dayFreq: Record<string, number> = {};
    for (const c of list) {
      mealFreq[c.preferred_meal_time] = (mealFreq[c.preferred_meal_time] || 0) + 1;
      dayFreq[c.preferred_day_type] = (dayFreq[c.preferred_day_type] || 0) + 1;
    }
    const prefMeal = Object.entries(mealFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Dinner';
    const prefDay = Object.entries(dayFreq).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Weekend';

    const retentionRisk =
      alertPct >= 30
        ? `Elevated (${highAlertsCount} overdue guests / ${alertPct.toFixed(0)}%)`
        : alertPct >= 15
        ? `Moderate (${highAlertsCount} overdue guests / ${alertPct.toFixed(0)}%)`
        : `Low (${highAlertsCount} overdue guests / ${alertPct.toFixed(0)}%)`;

    const insights: string[] =
      cid === 3
        ? [
            `Represents ${count} single-visit guests contributing ₹${Math.round(totalRev).toLocaleString('en-IN')} (${((count / totalCustomers) * 100).toFixed(1)}% of guests).`,
            `First-visit bill averages ₹${Math.round(avgSpendPerVisit).toLocaleString('en-IN')} with party size ${avgGroupSize.toFixed(1)}.`,
            `Most popular entry category is ${topFoodCat} during ${prefMeal} on ${prefDay}s.`,
          ]
        : [
            `Contributes ₹${Math.round(totalRev).toLocaleString('en-IN')} across ${count} guests (${((count / totalCustomers) * 100).toFixed(1)}% of customer base).`,
            `Average bill is ₹${Math.round(avgSpendPerVisit).toLocaleString('en-IN')} per visit (${avgSpendPerVisit >= overallAvgSpend ? 'above' : 'below'} restaurant avg of ₹${Math.round(overallAvgSpend).toLocaleString('en-IN')}) with ${avgVisits.toFixed(1)} visits/guest.`,
            `Primary preference is ${topFoodCat} during ${prefMeal} on ${prefDay}s.`,
          ];

    const recommendations: string[] = [];
    if (cid === 1) {
      recommendations.push(
        `Reserve priority ${prefDay} ${prefMeal} tables and offer personal chef hospitality around ${topFoodCat}.`,
        'Focus on refined VIP care and warm personal greetings.'
      );
    } else if (cid === 3) {
      recommendations.push(
        `Send a warm second-visit welcome message highlighting their ${topFoodCat} choice within 7–14 days.`,
        `Invite single-visit guests back for a relaxed ${prefMeal} experience.`
      );
    } else if (cid === 2) {
      recommendations.push(
        `Promote family-friendly ${topFoodCat} platters and comfortable group tables on ${prefDay}s.`,
        'Highlight multi-seat family dining experiences in follow-up messages.'
      );
    } else {
      recommendations.push(
        avgVisits >= overallAvgVisits
          ? 'Recognize loyal guests on milestone visits with signature hospitality.'
          : `Send personalized ${topFoodCat} dish reminders before ${prefDay} ${prefMeal} hours.`,
        `Reach out promptly to the ${highAlertsCount} guests who have not visited recently.`
      );
    }

    profiles.push({
      cluster_id: cid,
      cluster_name: meta.name,
      subtitle: meta.subtitle,
      customer_count: count,
      customer_share_pct: Number(((count / totalCustomers) * 100).toFixed(1)),
      total_revenue_inr: Math.round(totalRev),
      avg_total_spend_inr: Math.round(avgTotalSpend),
      avg_spend_per_visit_inr: Math.round(avgSpendPerVisit),
      avg_visits: Number(avgVisits.toFixed(1)),
      avg_group_size: Number(avgGroupSize.toFixed(1)),
      avg_children: 0,
      avg_rating: 0,
      discount_usage_pct: 0,
      high_alerts_count: highAlertsCount,
      top_food_category: topFoodCat,
      preferred_meal_time: prefMeal,
      preferred_day_type: prefDay,
      retention_risk: retentionRisk,
      business_insights: insights,
      recommendations: recommendations.slice(0, 3),
    });
  }

  return profiles;
}