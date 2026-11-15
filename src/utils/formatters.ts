export const BRAND_LOGO_URL =
  'https://yt3.googleusercontent.com/OzfkvM2ORpE_XansLC5-1ZmtenevjixKSvRQLthjivhjWUdJ-3uUtSiCF2Fn93npbM5tN19BZw=s900-c-k-c0x00ffffff-no-rj';
import type { CustomerRecord } from '../types';

export const HELPLINE_NUMBER = '7894561233';
export const REVENUE_PASSWORD = '2004';

export const BN_CATEGORY_MAP: Record<string, string> = {
  Chicken: 'চিকেন',
  Veg: 'ভেজ',
  Mutton: 'মাটন',
  Seafood: 'সি-ফুড',
  'Biryani & Rice': 'বিরিয়ানি ও রাইস',
  'Chinese & Fast Food': 'চাইনিজ ও ফাস্ট ফুড',
  'Dessert & Beverage': 'ডেজার্ট ও বেভারেজ',
};

export const BN_MEAL_MAP: Record<string, string> = {
  Lunch: 'লাঞ্চ',
  Dinner: 'ডিনার',
  'Evening Snacks': 'সন্ধ্যার স্ন্যাকস',
  'Late Night': 'লেট নাইট',
  Breakfast: 'ব্রেকফাস্ট',
};

export interface ClusterTemplateItem {
  badge: string;
  coupon: string | null;
  title: string;
  note: string;
  text: string;
}

export interface ClusterTemplateConfig {
  id: number;
  name: string;
  subtitle: string;
  color: string;
  templates: {
    en: ClusterTemplateItem[];
    bn: ClusterTemplateItem[];
  };
}

export const CLUSTER_CONFIG: Record<number, ClusterTemplateConfig> = {
  0: {
    id: 0,
    name: 'Frequent Visitors',
    subtitle: 'Regular diners with strong repeat-visit loyalty',
    color: '#ab6446',
    templates: {
      en: [
        {
          badge: 'Regular Guest Appreciation',
          coupon: null,
          title: 'Message 1 – Warm Regular Welcome',
          note: 'Thanks repeat guests and invites them back for their favourite dish.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, thank you for your {total_visits} wonderful visits with us. Your favourite {most_ordered_dish} is always freshly prepared for your next {preferred_meal_time}. For table reservations, contact us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: 'Chef Highlight',
          coupon: null,
          title: 'Message 2 – Favourite Dish Invitation',
          note: 'Invites regular diners for a signature meal around their preferred category.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, we are serving fresh {top_food_category} specials alongside your favourite {most_ordered_dish} this {preferred_day_type}. We look forward to hosting you again! Helpline: ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: 'নিয়মিত অতিথি',
          coupon: null,
          title: 'বার্তা ১ – নিয়মিত অতিথিকে আন্তরিক ধন্যবাদ',
          note: 'নিয়মিত অতিথিদের ধন্যবাদ ও প্রিয় খাবারের আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, আমাদের রেস্তোরাঁয় {total_visits} বার আসার জন্য আন্তরিক ধন্যবাদ! আপনার পরবর্তী {preferred_meal_time}-এ প্রিয় {most_ordered_dish} তাজা ও যত্নসহকারে প্রস্তুত থাকবে। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
        {
          badge: 'শেফ স্পেশাল',
          coupon: null,
          title: 'বার্তা ২ – প্রিয় খাবারের বিশেষ আমন্ত্রণ',
          note: 'পছন্দের খাবারের ক্যাটাগরি অনুযায়ী ডাইনিং আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, এই {preferred_day_type}-এ আপনার পছন্দের {top_food_category} এবং {most_ordered_dish} বিশেষ যত্নে তৈরি হচ্ছে। আবারও আপনাকে স্বাগত জানাতে অপেক্ষায় রইলাম। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
      ],
    },
  },
  1: {
    id: 1,
    name: 'Premium Customers',
    subtitle: 'High-spending guests who value curated hospitality',
    color: '#0284c7',
    templates: {
      en: [
        {
          badge: 'Priority Hospitality',
          coupon: null,
          title: 'Message 1 – Reserved Table & Personal Welcome',
          note: 'VIP hospitality invitation with priority seating.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, we are delighted to reserve priority table seating for your next {preferred_meal_time} visit so you can comfortably enjoy your favourite {most_ordered_dish} with our signature hospitality. For table reservations, reach us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: "Chef's Curated Menu",
          coupon: null,
          title: "Message 2 – Chef's Special Dining Invitation",
          note: 'Refined invitation tailored for high-spending guests.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, this week our chef has prepared our finest {top_food_category} selections alongside your favourite {most_ordered_dish}. We would be honoured to host you for a serene dining experience. For reservations, contact ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: 'প্রাইয়োরিটি সিটিং',
          coupon: null,
          title: 'বার্তা ১ – স্পেশাল টেবিল ও আতিথেয়তা',
          note: 'প্রিমিয়াম অতিথিদের জন্য বিশেষ টেবিল ও আতিথেয়তার আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, আমাদের বিশেষ অতিথি হিসেবে আপনার পরবর্তী {preferred_meal_time} ভিজিটে পছন্দের {most_ordered_dish} উপভোগ করার জন্য প্রাইয়োরিটি টেবিল রিজার্ভ থাকছে। টেবিল বুকিংয়ের জন্য ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`,
        },
        {
          badge: 'শেফ স্পেশাল মেনু',
          coupon: null,
          title: 'বার্তা ২ – শেফের স্পেশাল ডাইনিং আমন্ত্রণ',
          note: 'বিশেষ ডাইনিং অভিজ্ঞতার আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, এই সপ্তাহে আমাদের শেফ আপনার পছন্দের {top_food_category} এবং {most_ordered_dish} বিশেষ যত্নে তৈরি করছেন। পরিবার ও প্রিয়জনদের নিয়ে আমাদের আতিথেয়তা উপভোগ করতে আমন্ত্রিত। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
      ],
    },
  },
  2: {
    id: 2,
    name: 'Family Visitors',
    subtitle: 'Larger group & weekend celebration diners',
    color: '#d97706',
    templates: {
      en: [
        {
          badge: 'Weekend Family Dining',
          coupon: null,
          title: 'Message 1 – Family Gathering Invitation',
          note: 'Invites family groups for comfortable weekend dining.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, bring your group of {avg_group_size} this weekend for a warm family {preferred_meal_time} featuring our signature {top_food_category} platters and {most_ordered_dish}. For table reservations, contact us at ${HELPLINE_NUMBER}.`,
        },
        {
          badge: 'Group Table Ready',
          coupon: null,
          title: 'Message 2 – Family Table Reservation',
          note: 'Highlights comfortable group seating for family outings.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, make your next family {preferred_meal_time} memorable with us. We have spacious seating ready for your group along with your favourite {most_ordered_dish}. Call ${HELPLINE_NUMBER} to reserve.`,
        },
      ],
      bn: [
        {
          badge: 'উইকেন্ড ফ্যামিলি ডাইনিং',
          coupon: null,
          title: 'বার্তা ১ – ফ্যামিলি ডাইনিং আমন্ত্রণ',
          note: 'সপ্তাহান্তে পরিবার নিয়ে আসার আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, এই উইকেন্ডে পরিবারের সবাইকে ({avg_group_size} জন) নিয়ে চলে আসুন। আপনার পছন্দের {top_food_category} প্ল্যাটার ও {most_ordered_dish} পরিবেশনের জন্য আমরা প্রস্তুত। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
        {
          badge: 'ফ্যামিলি টেবিল বুকিং',
          coupon: null,
          title: 'বার্তা ২ – গ্রুপ সিটিং রিজার্ভেশন',
          note: 'পরিবারের সবার জন্য আরামদায়ক টেবিল বুকিংয়ের আমন্ত্রণ।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, পরিবারের সাথে আপনার পরবর্তী {preferred_meal_time} আনন্দময় করতে চলে আসুন! সবার জন্য আরামদায়ক টেবিল ও পছন্দের {most_ordered_dish} প্রস্তুত আছে। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
      ],
    },
  },
  3: {
    id: 3,
    name: 'Occasional Customers',
    subtitle: 'Single-visit guests ready to be welcomed back',
    color: '#0d9488',
    templates: {
      en: [
        {
          badge: 'Welcome Back',
          coupon: null,
          title: 'Message 1 – Second Visit Invitation',
          note: 'Warmly invites single-visit guests back for another meal.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, thank you for dining with us! We would love to host you again for your next {preferred_meal_time} and serve your favourite {most_ordered_dish}. For table reservations or queries, call ${HELPLINE_NUMBER}.`,
        },
        {
          badge: 'Signature Specials',
          coupon: null,
          title: 'Message 2 – Explore Our Menu Again',
          note: 'Reminds first-time guests of their top food category.',
          text: `Greetings from Mother's Hut!\nHi {customer_name}, we loved hosting your first visit! Drop by soon to enjoy our fresh {top_food_category} dishes and house specials during {preferred_meal_time}. Helpline: ${HELPLINE_NUMBER}.`,
        },
      ],
      bn: [
        {
          badge: 'দ্বিতীয় ভিজিট আমন্ত্রণ',
          coupon: null,
          title: 'বার্তা ১ – দ্বিতীয়বার আসার আন্তরিক আমন্ত্রণ',
          note: 'প্রথমবার আসা অতিথিদের আবার স্বাগত জানানোর বার্তা।',
          text: `Greetings from Mother's Hut!\nনমস্কার {customer_name}, আমাদের রেস্তোরাঁয় আসার জন্য ধন্যবাদ! আপনার পরবর্তী {preferred_meal_time}-এ পছন্দের {most_ordered_dish} পরিবেশন করতে আমরা আবার অপেক্ষায় রইলাম। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
        {
          badge: 'সিগনেচার মেনু',
          coupon: null,
          title: 'বার্তা ২ – স্পেশাল ডিশের আমন্ত্রণ',
          note: 'প্রথম ভিজিটের পছন্দের ক্যাটাগরি মনে করিয়ে দেওয়ার বার্তা।',
          text: `Greetings from Mother's Hut!\nপ্রিয় {customer_name}, আপনাকে আবার স্বাগত জানাতে চাই! আমাদের তাজা {top_food_category} স্পেশাল উপভোগ করতে শীঘ্রই চলে আসুন। যোগাযোগ: ${HELPLINE_NUMBER}।`,
        },
      ],
    },
  },
};

export function cleanLabel(str: string | null | undefined): string {
  return String(str || '').replace(/_/g, ' ');
}

export function formatPhone(raw: string | null | undefined): string {
  const d = String(raw || '').replace(/\D/g, '');
  return d.length === 10 ? `+91 ${d.slice(0, 5)} ${d.slice(5)}` : raw || 'N/A';
}

export function formatINR(v: number | string | null | undefined): string {
  return '₹' + Math.round(Number(v) || 0).toLocaleString('en-IN');
}

export function getInitials(name: string | null | undefined): string {
  return (name || 'G')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');
}

export function applyPlaceholders(
  template: string,
  c: CustomerRecord,
  lang: 'en' | 'bn' = 'en'
): string {
  const rawMeal = cleanLabel(c.preferred_meal_time || 'Dinner');
  const rawCat = c.top_food_category || 'Signature Food';
  const mealText = lang === 'bn' ? BN_MEAL_MAP[rawMeal] || rawMeal : rawMeal;
  const catText = lang === 'bn' ? BN_CATEGORY_MAP[rawCat] || rawCat : rawCat;
  const dishText =
    c.most_ordered_dish && c.most_ordered_dish.trim()
      ? c.most_ordered_dish
      : 'our house specials';

  return template
    .replaceAll('{customer_name}', c.customer_name || 'Guest')
    .replaceAll('{customer_id}', c.customer_id || '')
    .replaceAll('{total_visits}', String(c.total_visits))
    .replaceAll('{most_ordered_dish}', dishText)
    .replaceAll('{top_food_category}', catText)
    .replaceAll('{preferred_order_channel}', cleanLabel(c.preferred_order_channel || 'Dine-In'))
    .replaceAll('{preferred_meal_time}', mealText)
    .replaceAll('{preferred_day_type}', c.preferred_day_type || 'Weekend')
    .replaceAll('{avg_group_size}', String(c.avg_group_size || 2))
    .replaceAll('{phone_no}', HELPLINE_NUMBER);
}

export function getRealisticOffer(c: CustomerRecord): {
  coupon: string | null;
  offerTitle: string;
  reason: string;
  messageEn: string;
  messageBn: string;
} {
  const name = c.customer_name || 'Guest';
  const dish =
    c.most_ordered_dish && c.most_ordered_dish.trim()
      ? c.most_ordered_dish
      : "Chef's Special";
  const cat = c.top_food_category || 'Signature';
  const meal = cleanLabel(c.preferred_meal_time || 'Dinner');
  const channel = cleanLabel(c.preferred_order_channel || 'Dine-In');
  const bnCat = BN_CATEGORY_MAP[cat] || cat;
  const bnMeal = BN_MEAL_MAP[meal] || meal;

  const prefixEn = `Greetings from Mother's Hut!\nHi ${name}, `;
  const prefixBn = `Greetings from Mother's Hut!\nনমস্কার ${name}, `;
  const reason = `${c.cluster_name} guest with ${c.total_visits} visit(s) (avg ${formatINR(
    c.avg_spend_per_visit_inr
  )}/visit), ordered ${cat} ${c.top_food_orders} time(s), and last visited ${c.days_since_last_visit} days ago.`;

  if (c.cluster_id === 1) {
    const offerTitle = `Priority ${meal} Table & Signature ${dish} Hospitality`;
    const messageEn = `${prefixEn}We have missed hosting you. Your preferred ${meal} table and our freshly prepared ${dish} (${cat}) await you on your next visit. For priority table reservations, call us at ${HELPLINE_NUMBER}.`;
    const messageBn = `${prefixBn}অনেকদিন আপনাকে আমাদের রেস্তোরাঁয় দেখিনি। আপনার পরবর্তী ${bnMeal} ভিজিটে পছন্দের ${dish} (${bnCat}) এবং প্রাইয়োরিটি টেবিল প্রস্তুত থাকবে। রিজার্ভেশনের জন্য ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`;
    return { coupon: null, offerTitle, reason, messageEn, messageBn };
  }

  if (c.cluster_id === 2) {
    const offerTitle = `Family ${meal} Gathering & ${dish} Table Invite`;
    const messageEn = `${prefixEn}We've missed seeing you and your family! Our comfortable group seating and freshly cooked ${dish} (${cat}) await your next ${meal} (${channel}). Call ${HELPLINE_NUMBER} for reservations.`;
    const messageBn = `${prefixBn}অনেকদিন আপনাকে ও আপনার পরিবারকে আমাদের রেস্তোরাঁয় দেখিনি! আপনার পরবর্তী ${bnMeal}-এ প্রিয় ${dish} (${bnCat}) এবং ফ্যামিলি টেবিল প্রস্তুত থাকবে। যোগাযোগ: ${HELPLINE_NUMBER}।`;
    return { coupon: null, offerTitle, reason, messageEn, messageBn };
  }

  if (c.cluster_id === 3) {
    const offerTitle = `Second Visit Welcome Back for ${dish} (${cat})`;
    const messageEn = `${prefixEn}Thank you for dining with us! We would love to welcome you back for another ${meal} (${channel}) featuring your favourite ${dish}. For table reservations, call ${HELPLINE_NUMBER}.`;
    const messageBn = `${prefixBn}আমাদের রেস্তোরাঁয় আসার জন্য ধন্যবাদ! আপনার পরবর্তী ${bnMeal}-এ প্রিয় ${dish} (${bnCat}) উপভোগ করতে আবার স্বাগতম। যোগাযোগ: ${HELPLINE_NUMBER}।`;
    return { coupon: null, offerTitle, reason, messageEn, messageBn };
  }

  const offerTitle = `Welcome Back for Your Favourite ${dish} (${cat})`;
  const messageEn = `${prefixEn}We've missed hosting you! Your favourite ${dish} (${cat}) is freshly prepared for your next ${meal} (${channel}). For table reservations or queries, contact us at ${HELPLINE_NUMBER}.`;
  const messageBn = `${prefixBn}অনেকদিন আপনাকে আমাদের রেস্তোরাঁয় দেখিনি! আপনার পরবর্তী ${bnMeal}-এ প্রিয় ${dish} (${bnCat}) প্রস্তুত থাকবে। যেকোনো প্রয়োজনে আমাদের ${HELPLINE_NUMBER} নম্বরে যোগাযোগ করুন।`;

  return { coupon: null, offerTitle, reason, messageEn, messageBn };
}