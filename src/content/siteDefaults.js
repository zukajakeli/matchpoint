// Built-in website content. Used when the database has nothing saved yet
// (or can't be reached), and as the starting point in the admin editor.
// Everything here can be overridden from /superadmin/website.

export const DEFAULT_HERO_IMAGE = "/hero-tables.jpg";

// Pick the visitor's language, falling back to Georgian.
export function localized(value, lang) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  return (lang === "en" ? value.en : value.ka) || value.ka || value.en || "";
}

// Same, for rows with _ka / _en columns (hero slides, gallery images).
export function pick(row, field, lang) {
  if (!row) return "";
  const ka = row[`${field}_ka`];
  const en = row[`${field}_en`];
  return ((lang === "en" ? en : ka) || ka || en || "").trim();
}

// Mirrors the starter rows in supabase/schema.sql.
export const DEFAULT_SLIDES = [
  {
    id: "default-brand",
    kind: "brand",
    title_ka: "წამო, რამე ვითამაშოთ",
    title_en: "Come on, let's play something",
    subtitle_ka:
      "მატჩ ფოინთში დაგხვდება 10 ჩოგბურთ მაგიდა, ბარი, მაგიდის ფეხბურთი & ჰოკეი, ბიერ პონგი და PS5. ჩვენს ეზოში შეგიძლია ითამაშო ჭადრაკი და სხვადასხვა ქარდ და ბორდ გეიმები.",
    subtitle_en:
      "At MatchPoint you'll find 10 ping pong tables, a bar, foosball & air hockey, beer pong and PS5. In our yard you can play chess and all kinds of card and board games.",
    cta_ka: "გაიცანი მატჩ ფოინთი",
    cta_en: "Explore MatchPoint",
    link_url: "/#services",
    image: DEFAULT_HERO_IMAGE,
    image_alt: "MatchPoint ping pong hall with players at the tables",
    image_position: "center",
  },
  {
    id: "default-events",
    kind: "events",
    title_ka: "მომავალი ივენთები",
    title_en: "Upcoming events",
    cta_ka: "ივენთების ნახვა",
    cta_en: "Explore Events",
    link_url: "/events",
    image: null,
    image_alt: "Table tennis tournament at MatchPoint",
    image_position: "left center",
  },
  {
    id: "default-book",
    kind: "book",
    title_ka: "დაჯავშნე მაგიდა",
    title_en: "Book your table",
    subtitle_ka: "აირჩიე დრო და დაჯავშნე ონლაინ.",
    subtitle_en: "Pick a time and book online.",
    cta_ka: "დაჯავშნე ახლა",
    cta_en: "Book Now",
    link_url: "/book",
    image: DEFAULT_HERO_IMAGE,
    image_alt: "Ping pong tables ready to play at MatchPoint",
    image_position: "center bottom",
  },
  {
    id: "default-corporate",
    kind: "corporate",
    title_ka: "კორპორატიული ივენთები მატჩ ფოინთში",
    title_en: "Corporate events at MatchPoint",
    subtitle_ka: "ტურნირები, თიმბილდინგი და კერძო ღონისძიებები შენი გუნდისთვის.",
    subtitle_en: "Tournaments, team building and private events for your team.",
    cta_ka: "დაგეგმე ივენთი",
    cta_en: "Plan Your Event",
    link_url: "/corporate-events",
    image: DEFAULT_HERO_IMAGE,
    image_alt: "Group of friends playing table tennis at MatchPoint",
    image_position: "right center",
  },
];

export const SLIDE_KINDS = {
  brand: { label: "Main brand banner", link: "/#services" },
  events: { label: "Upcoming events", link: "/events" },
  book: { label: "Book a table", link: "/book" },
  corporate: { label: "Corporate events", link: "/corporate-events" },
  custom: { label: "Custom", link: "/" },
};

// site_content 'contact'
export const DEFAULT_CONTACT = {
  phone: "+995 555 613 330",
  email: "matchpoint.ge@gmail.com",
  address: { ka: "პეტრე კავთარაძის ქ. 17, თბილისი 0186", en: "17 Petre Kavtaradze St, Tbilisi 0186" },
};

// site_content 'corporate'
export const DEFAULT_CORPORATE = {
  intro_title: { ka: "ერთად ვითამაშოთ, ერთად გავიმარჯვოთ", en: "Play together, win together" },
  intro_text: {
    ka: "მატჩ ფოინთი მასპინძლობს კორპორატიულ ჩოგბურთის ტურნირებს, თიმბილდინგ აქტივობებსა და კერძო ჯგუფურ ღონისძიებებს. ჩვენ მოვამზადებთ მაგიდებს, ვმართავთ ტურნირის ცხრილს და ვზრუნავთ სასმელებზე — შენი გუნდი კი დაისვენებს, ცოტას იშეჯიბრებს და ერთმანეთს უკეთ გაიცნობს.",
    en: "MatchPoint hosts corporate table tennis tournaments, team-building activities and private group events. We set up the tables, run the brackets and keep the drinks coming, so your team can switch off, compete a little and get to know each other better.",
  },
  options: [
    {
      icon: "🏓",
      title: { ka: "კორპორატიული ჩოგბურთის ტურნირები", en: "Corporate table tennis tournaments" },
      text: {
        ka: "ჯგუფური ეტაპი და პლეიოფი ჩვენს 10 მაგიდაზე, მსაჯით, ტურნირის ცხრილით და პრიზებით გამარჯვებულებისთვის.",
        en: "Group stage and playoffs on our 10 tables, with a referee, brackets and prizes for the winners.",
      },
    },
    {
      icon: "🤝",
      title: { ka: "თიმბილდინგი", en: "Team-building events" },
      text: {
        ka: "შერეული გუნდები, მოკლე გამოწვევები და მეგობრული თამაშები, რომლებიც კოლეგებს ერთმანეთთან აახლოებს.",
        en: "Mixed teams, short challenges and friendly games that get colleagues talking and laughing.",
      },
    },
    {
      icon: "🔒",
      title: { ka: "კერძო ჯგუფური ჯავშანი", en: "Private group bookings" },
      text: {
        ka: "დაჯავშნე სივრცის ნაწილი ან მთელი დარბაზი შენი გუნდისთვის, დაბადების დღისთვის ან სხვა ზეიმისთვის.",
        en: "Reserve part of the venue or the whole hall for your team, birthday or celebration.",
      },
    },
    {
      icon: "🏆",
      title: { ka: "მეგობრული შეჯიბრებები", en: "Friendly competitions" },
      text: {
        ka: "დეპარტამენტი დეპარტამენტის წინააღმდეგ, ოფისის ლიგა ან მშვიდი საღამო სამსახურის შემდეგ.",
        en: "Department vs department, office leagues or a relaxed after-work match night.",
      },
    },
    {
      icon: "🎮",
      title: { ka: "სხვა თამაშები", en: "More games" },
      text: {
        ka: "მაგიდის ფეხბურთი, ჰოკეი, ბიერ პონგი და PlayStation 5 მათთვის, ვისაც პინგ-პონგისგან შესვენება უნდა.",
        en: "Foosball, table hockey, beer pong and PlayStation 5 for everyone who wants a break from ping pong.",
      },
    },
    {
      icon: "🍹",
      title: { ka: "სასმელები და სნექები", en: "Drinks & snacks" },
      text: {
        ka: "ჩვენი ბარი სასმელებითა და სნექებით ენერგიას შეგინარჩუნებთ; შენი ჯგუფისთვის სპეციალურ პაკეტსაც მოვამზადებთ.",
        en: "Our bar keeps the energy up with drinks and snacks, and we can prepare packages for your group.",
      },
    },
  ],
};

// Saved content wins field by field; anything missing keeps the default.
export function mergeContent(defaults, saved) {
  if (!saved || typeof saved !== "object") return defaults;
  const out = { ...defaults };
  for (const [key, value] of Object.entries(saved)) {
    if (value == null) continue;
    if (Array.isArray(value)) out[key] = value.length ? value : defaults[key];
    else if (typeof value === "object" && defaults[key] && typeof defaults[key] === "object" && !Array.isArray(defaults[key])) {
      out[key] = mergeContent(defaults[key], value);
    } else if (value !== "") out[key] = value;
  }
  return out;
}
