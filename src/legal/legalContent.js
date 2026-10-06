// Legal pages (Terms, Privacy, Refunds, Payments) in Georgian and English.
// Company details live in COMPANY so the footer, contact page and every
// policy stay in sync. Review the texts with the business before relying on
// them; dates and refund windows are business decisions.

export const COMPANY = {
  legalNameKa: "შპს მეჩ ფოინთ",
  legalNameEn: "Match Point LLC",
  idNumber: "405776487",
  brand: "MatchPoint",
  addressKa: "პეტრე კავთარაძის ქ. 17, თბილისი 0186, საქართველო",
  addressEn: "17 Petre Kavtaradze St, Tbilisi 0186, Georgia",
  phone: "+995 555 613 330",
  phoneHref: "tel:+995555613330",
  email: "matchpoint.ge@gmail.com",
  website: "www.matchpoint.ge",
};

export const LEGAL_UPDATED = "2026-10-06";

// Hours before the booked start time until which a cancellation is refunded.
export const FREE_CANCELLATION_HOURS = 24;

export const LEGAL_SLUGS = ["terms", "privacy", "refunds", "payments"];

const C = COMPANY;
const H = FREE_CANCELLATION_HOURS;

export const LEGAL_PAGES = {
  terms: {
    ka: {
      title: "წესები და პირობები",
      intro: `ეს წესები არეგულირებს ვებგვერდის ${C.website} გამოყენებას და ${C.brand}-ის მომსახურების (მაგიდების დაჯავშნა, ღონისძიებები, კლუბის წევრობა) შეძენას. დაჯავშნით ან გადახდით თქვენ ეთანხმებით ამ წესებს.`,
      sections: [
        {
          h: "1. მომსახურების მიმწოდებელი",
          body: [
            `მომსახურებას გთავაზობთ ${C.legalNameKa} (საიდენტიფიკაციო კოდი: ${C.idNumber}), მისამართი: ${C.addressKa}. კონტაქტი: ${C.phone}, ${C.email}.`,
          ],
        },
        {
          h: "2. მომსახურება",
          body: [
            "MatchPoint არის პინგ-პონგის კლუბი თბილისში. ვებგვერდის მეშვეობით შეგიძლიათ დაჯავშნოთ პინგ-პონგის მაგიდა, ფეხბურთის მაგიდა, აეროჰოკეი ან PlayStation კონკრეტული თარიღისა და დროისთვის, დარეგისტრირდეთ ღონისძიებებსა და ტურნირებზე და ისარგებლოთ კლუბის წევრობით.",
          ],
        },
        {
          h: "3. ფასები და დაჯავშნა",
          body: [
            "ფასები მითითებულია ლარში (₾) და მოიცავს ყველა გადასახადს. საბოლოო თანხა ნაჩვენებია გადახდამდე.",
            {
              list: [
                "ჯავშანი შესაძლებელია მინიმუმ 1 საათით ადრე, 1-დან 3 საათამდე ხანგრძლივობით, სამუშაო საათებში.",
                "ჯავშანი დადასტურებულად ითვლება მხოლოდ წარმატებული გადახდის შემდეგ. დადასტურება იგზავნება მითითებულ ელ. ფოსტაზე.",
                "გადაუხდელი ჯავშანი ავტომატურად უქმდება 20 წუთში.",
                "დაგვიანების შემთხვევაში ჯავშნის დრო არ გრძელდება.",
                "MatchPoint იტოვებს უფლებას, საჭიროების შემთხვევაში შეგთავაზოთ სხვა, თანაბარი მაგიდა.",
              ],
            },
          ],
        },
        {
          h: "4. გაუქმება და თანხის დაბრუნება",
          body: [
            `გაუქმებისა და თანხის დაბრუნების პირობები აღწერილია გვერდზე „თანხის დაბრუნების პოლიტიკა“. მოკლედ: დაწყებამდე ${H} საათით ადრე გაუქმებისას თანხა სრულად ბრუნდება.`,
          ],
        },
        {
          h: "5. კლუბის წესები",
          body: [
            {
              list: [
                "დაიცავით პერსონალის მითითებები და უსაფრთხოების წესები.",
                "განზრახ ან უხეში გაუფრთხილებლობით დაზიანებული ინვენტარის ღირებულება ანაზღაურდება მომხმარებლის მიერ.",
                "ალკოჰოლური სასმელები მიეწოდება მხოლოდ 18 წელს გადაცილებულ პირებს.",
                "MatchPoint-ს შეუძლია უარი თქვას მომსახურებაზე იმ პირთან, ვინც არღვევს წესრიგს.",
              ],
            },
          ],
        },
        {
          h: "6. კლუბის წევრობა და ქულები",
          body: [
            "წევრობა უფასოა. ქულები გროვდება კლუბში თამაშისას და შეიძლება გადაიცვალოს ჯილდოებში. ქულებს არ აქვს ფულადი ღირებულება, არ გადაიცემა და არ იცვლება ფულზე. MatchPoint-ს შეუძლია შეცვალოს ქულების დარიცხვის წესი და ჯილდოები; უკვე დაგროვილი ქულები ძალაში რჩება.",
          ],
        },
        {
          h: "7. პასუხისმგებლობა",
          body: [
            "MatchPoint არ აგებს პასუხს პირად ნივთებზე, რომლებიც უყურადღებოდ არის დატოვებული. სპორტული აქტივობა ხორციელდება საკუთარი პასუხისმგებლობით. ეს არ ზღუდავს თქვენს უფლებებს, რომლებიც გათვალისწინებულია საქართველოს კანონმდებლობით.",
          ],
        },
        {
          h: "8. ცვლილებები და მოქმედი სამართალი",
          body: [
            "MatchPoint-ს შეუძლია განაახლოს ეს წესები; ცვლილებები ძალაში შედის ვებგვერდზე გამოქვეყნებისთანავე და არ ეხება უკვე გადახდილ ჯავშნებს. წესები რეგულირდება საქართველოს კანონმდებლობით. დავები წყდება მოლაპარაკებით, ხოლო შეუთანხმებლობისას — საქართველოს სასამართლოში.",
          ],
        },
      ],
    },
    en: {
      title: "Terms & Conditions",
      intro: `These terms govern the use of ${C.website} and the purchase of ${C.brand} services (table bookings, events, club membership). By booking or paying you agree to them.`,
      sections: [
        {
          h: "1. Service provider",
          body: [
            `Services are provided by ${C.legalNameEn} (${C.legalNameKa}), identification number ${C.idNumber}, ${C.addressEn}. Contact: ${C.phone}, ${C.email}.`,
          ],
        },
        {
          h: "2. Services",
          body: [
            "MatchPoint is a ping pong club in Tbilisi. On this website you can book a ping pong table, foosball, air hockey or PlayStation for a specific date and time, register for events and tournaments, and use the club membership.",
          ],
        },
        {
          h: "3. Prices and booking",
          body: [
            "Prices are in Georgian lari (₾) and include all taxes. The final amount is shown before payment.",
            {
              list: [
                "Bookings can be made at least 1 hour in advance, for 1 to 3 hours, within opening hours.",
                "A booking is confirmed only after successful payment. A confirmation is sent to the email you provide.",
                "Unpaid bookings are released automatically after 20 minutes.",
                "Arriving late does not extend the booked time.",
                "MatchPoint may offer an equivalent table if needed.",
              ],
            },
          ],
        },
        {
          h: "4. Cancellations and refunds",
          body: [
            `See the Refund & Cancellation Policy. In short: cancel at least ${H} hours before the start for a full refund.`,
          ],
        },
        {
          h: "5. Club rules",
          body: [
            {
              list: [
                "Follow staff instructions and safety rules.",
                "Equipment damaged deliberately or through gross negligence must be paid for.",
                "Alcohol is served only to guests aged 18 and over.",
                "MatchPoint may refuse service to anyone disturbing order.",
              ],
            },
          ],
        },
        {
          h: "6. Club membership and points",
          body: [
            "Membership is free. Points are earned by playing at the club and can be exchanged for rewards. Points have no cash value, cannot be transferred and cannot be exchanged for money. MatchPoint may change how points are earned and which rewards are offered; points already earned remain valid.",
          ],
        },
        {
          h: "7. Liability",
          body: [
            "MatchPoint is not responsible for personal belongings left unattended. Sports activities are at your own risk. Nothing here limits your rights under Georgian law.",
          ],
        },
        {
          h: "8. Changes and governing law",
          body: [
            "MatchPoint may update these terms; changes take effect when published here and do not affect bookings already paid. These terms are governed by the laws of Georgia. Disputes are settled by negotiation or, failing that, by the courts of Georgia.",
          ],
        },
      ],
    },
  },

  privacy: {
    ka: {
      title: "კონფიდენციალურობის პოლიტიკა",
      intro: `${C.legalNameKa} (ს/კ ${C.idNumber}) არის თქვენი პერსონალური მონაცემების დამმუშავებელი. მონაცემებს ვამუშავებთ „პერსონალურ მონაცემთა დაცვის შესახებ“ საქართველოს კანონის შესაბამისად.`,
      sections: [
        {
          h: "1. რა მონაცემებს ვაგროვებთ",
          body: [
            {
              list: [
                "დაჯავშნისას: სახელი, ელ. ფოსტა, ტელეფონი, ჯავშნის დეტალები და გადახდის სტატუსი.",
                "ბარათის მონაცემებს ვერ ვხედავთ და არ ვინახავთ — მათ ამუშავებს გადახდის პროვაიდერი Flitt. ჩვენთან ინახება მხოლოდ ბარათის ნომრის ბოლო ციფრები.",
                "კლუბის წევრობისას: სახელი, გვარი, ტელეფონი, ელ. ფოსტა, საჭიროების შემთხვევაში პირადი ნომერი, ვიზიტების ისტორია და ქულები.",
                "ღონისძიებაზე რეგისტრაციისას: სახელი, ელ. ფოსტა, ტელეფონი.",
                "ტექნიკური მონაცემები: ენის არჩევანი და შესვლის სესია ინახება თქვენს ბრაუზერში (localStorage).",
              ],
            },
          ],
        },
        {
          h: "2. რისთვის ვიყენებთ",
          body: [
            {
              list: [
                "ჯავშნის შესასრულებლად, დასადასტურებლად და საჭიროების შემთხვევაში თქვენთან დასაკავშირებლად;",
                "გადახდის დასამუშავებლად და თანხის დასაბრუნებლად;",
                "კლუბის წევრობის, ქულებისა და ჯილდოების სამართავად;",
                "მომსახურების გასაუმჯობესებლად (აგრეგირებული სტატისტიკა);",
                "კანონით დაკისრებული ვალდებულებების შესასრულებლად.",
              ],
            },
            "სარეკლამო შეტყობინებებს გამოგიგზავნით მხოლოდ თქვენი თანხმობით.",
          ],
        },
        {
          h: "3. ვის ვუზიარებთ",
          body: [
            "მონაცემებს არ ვყიდით. ვუზიარებთ მხოლოდ მომსახურების მიმწოდებლებს, რომლებიც ჩვენი დავალებით მოქმედებენ:",
            {
              list: [
                "Flitt — ბარათით გადახდა;",
                "Supabase — მონაცემთა ბაზა და ავტორიზაცია;",
                "Vercel — ვებგვერდის ჰოსტინგი;",
                "Resend — ელ. ფოსტის გაგზავნა (ჯავშნის დადასტურება, შესვლის ბმული).",
              ],
            },
            "ამ პროვაიდერების სერვერები შეიძლება მდებარეობდეს საქართველოს ფარგლებს გარეთ; მონაცემთა გადაცემა ხორციელდება კანონით დადგენილი დაცვის გარანტიებით.",
          ],
        },
        {
          h: "4. შენახვის ვადა",
          body: [
            "ჯავშნისა და გადახდის ჩანაწერებს ვინახავთ იმდენ ხანს, რამდენიც საჭიროა მომსახურებისთვის და ბუღალტრული/საგადასახადო ვალდებულებებისთვის. კლუბის წევრობის მონაცემები ინახება წევრობის განმავლობაში; წევრობის გაუქმების მოთხოვნის შემდეგ მონაცემები იშლება ან ანონიმიზდება, გარდა კანონით შესანახი ჩანაწერებისა.",
          ],
        },
        {
          h: "5. თქვენი უფლებები",
          body: [
            "გაქვთ უფლება მოითხოვოთ ინფორმაცია თქვენი მონაცემების დამუშავების შესახებ, მათი ასლი, შესწორება, წაშლა ან დამუშავების შეწყვეტა, ასევე გაიხმოთ თანხმობა. მოთხოვნისთვის მოგვწერეთ: " +
              C.email +
              ". გაქვთ უფლება მიმართოთ პერსონალურ მონაცემთა დაცვის სამსახურს.",
          ],
        },
        {
          h: "6. უსაფრთხოება",
          body: [
            "მონაცემები ინახება დაშიფრული კავშირით (HTTPS) ხელმისაწვდომ სისტემებში; წვდომა აქვს მხოლოდ უფლებამოსილ პერსონალს.",
          ],
        },
      ],
    },
    en: {
      title: "Privacy Policy",
      intro: `${C.legalNameEn} (${C.legalNameKa}, ID ${C.idNumber}) is the controller of your personal data. We process it in line with the Law of Georgia on Personal Data Protection.`,
      sections: [
        {
          h: "1. What we collect",
          body: [
            {
              list: [
                "When you book: name, email, phone, booking details and payment status.",
                "We never see or store your card details — payments are processed by Flitt. We keep only the last digits of the card number.",
                "Club membership: first and last name, phone, email, personal ID number if required, visit history and points.",
                "Event registration: name, email, phone.",
                "Technical: your language choice and sign-in session are stored in your browser (localStorage).",
              ],
            },
          ],
        },
        {
          h: "2. Why we use it",
          body: [
            {
              list: [
                "to fulfil and confirm bookings and contact you about them;",
                "to process payments and refunds;",
                "to run the club membership, points and rewards;",
                "to improve our service (aggregated statistics);",
                "to meet legal obligations.",
              ],
            },
            "We send marketing messages only with your consent.",
          ],
        },
        {
          h: "3. Who we share it with",
          body: [
            "We never sell your data. We share it only with service providers acting on our behalf:",
            {
              list: [
                "Flitt — card payments;",
                "Supabase — database and sign-in;",
                "Vercel — website hosting;",
                "Resend — email delivery (booking confirmations, sign-in links).",
              ],
            },
            "These providers may store data outside Georgia; transfers are made with the safeguards required by law.",
          ],
        },
        {
          h: "4. How long we keep it",
          body: [
            "Booking and payment records are kept as long as needed for the service and for accounting and tax obligations. Membership data is kept while you are a member; when you ask to end your membership it is deleted or anonymised, except records the law requires us to keep.",
          ],
        },
        {
          h: "5. Your rights",
          body: [
            `You may ask what data we hold about you, request a copy, correction, deletion or a stop to processing, and withdraw consent. Write to ${C.email}. You may also contact the Personal Data Protection Service of Georgia.`,
          ],
        },
        {
          h: "6. Security",
          body: [
            "Data is transmitted over encrypted connections (HTTPS) and access is limited to authorised staff.",
          ],
        },
      ],
    },
  },

  refunds: {
    ka: {
      title: "გაუქმებისა და თანხის დაბრუნების პოლიტიკა",
      intro: "მაგიდის ჯავშანი არის დასვენების მომსახურება კონკრეტული თარიღისა და დროისთვის, ამიტომ მასზე ვრცელდება ქვემოთ მოცემული პირობები.",
      sections: [
        {
          h: "1. მაგიდის ჯავშანი",
          body: [
            {
              list: [
                `დაწყებამდე ${H} საათით ან მეტით ადრე გაუქმებისას — თანხა სრულად ბრუნდება.`,
                `დაწყებამდე ${H} საათზე ნაკლები დროით ადრე გაუქმებისას ან გამოუცხადებლობისას — თანხა არ ბრუნდება. შესაძლებლობის შემთხვევაში შეგვიძლია ჯავშნის სხვა დროზე გადატანა.`,
                "თუ ჯავშანს MatchPoint აუქმებს (მაგ. ტექნიკური მიზეზით ან დახურვის გამო), თანხა სრულად ბრუნდება.",
              ],
            },
          ],
        },
        {
          h: "2. ღონისძიებები და ტურნირები",
          body: [
            {
              list: [
                "რეგისტრაციის ბოლო ვადამდე გაუქმებისას — თანხა სრულად ბრუნდება.",
                "ბოლო ვადის შემდეგ ან გამოუცხადებლობისას — თანხა არ ბრუნდება.",
                "თუ ღონისძიება უქმდება, თანხა სრულად ბრუნდება.",
              ],
            },
          ],
        },
        {
          h: "3. როგორ მოითხოვოთ",
          body: [
            `დაგვიკავშირდით ${C.phone} ან ${C.email}, მიუთითეთ სახელი, ჯავშნის თარიღი და შეკვეთის კოდი (დადასტურების წერილიდან).`,
          ],
        },
        {
          h: "4. თანხის დაბრუნების ვადა",
          body: [
            "დაბრუნება ხორციელდება იმავე ბარათზე, რომლითაც გადაიხადეთ, დადასტურებიდან 5 სამუშაო დღის განმავლობაში. თანხის ასახვის დრო დამოკიდებულია თქვენს ბანკზე (ჩვეულებრივ 5–10 სამუშაო დღე).",
          ],
        },
        {
          h: "5. ადგილზე შეძენილი მომსახურება",
          body: [
            "კლუბში ადგილზე გადახდილი თამაშის დრო და ბარის პროდუქცია არ ექვემდებარება ონლაინ დაბრუნებას; საკითხი წყდება ადგილზე, პერსონალთან.",
          ],
        },
      ],
    },
    en: {
      title: "Refund & Cancellation Policy",
      intro: "A table booking is a leisure service for a specific date and time, so the following terms apply.",
      sections: [
        {
          h: "1. Table bookings",
          body: [
            {
              list: [
                `Cancel ${H} hours or more before the start — full refund.`,
                `Cancel less than ${H} hours before the start, or no-show — no refund. Where possible we may move your booking to another time.`,
                "If MatchPoint cancels your booking (e.g. technical issues or closure) — full refund.",
              ],
            },
          ],
        },
        {
          h: "2. Events and tournaments",
          body: [
            {
              list: [
                "Cancel before the registration deadline — full refund.",
                "After the deadline, or no-show — no refund.",
                "If the event is cancelled — full refund.",
              ],
            },
          ],
        },
        {
          h: "3. How to request",
          body: [
            `Contact us at ${C.phone} or ${C.email} with your name, booking date and the order code from your confirmation email.`,
          ],
        },
        {
          h: "4. Refund timing",
          body: [
            "Refunds go back to the card you paid with, within 5 business days of approval. How long it takes to appear depends on your bank (usually 5–10 business days).",
          ],
        },
        {
          h: "5. Purchases at the venue",
          body: [
            "Playing time and bar items paid for at the venue are not refunded online; please speak to our staff on site.",
          ],
        },
      ],
    },
  },

  payments: {
    ka: {
      title: "გადახდა და უსაფრთხოება",
      intro: "ონლაინ გადახდები მუშავდება ლიცენზირებული გადახდის პროვაიდერის, Flitt-ის, დაცულ გვერდზე.",
      sections: [
        {
          h: "1. გადახდის საშუალებები",
          body: [
            "მიიღება Visa და Mastercard ბარათები, ასევე Google Pay და Apple Pay. ყველა თანხა მითითებულია და ჩამოიჭრება ლარში (₾). სხვა ვალუტის ბარათის შემთხვევაში კონვერტაციას ახორციელებს თქვენი ბანკი.",
          ],
        },
        {
          h: "2. უსაფრთხოება",
          body: [
            "ბარათის მონაცემები შეგყავთ პირდაპირ Flitt-ის დაცულ გვერდზე (HTTPS, PCI DSS სტანდარტი, 3-D Secure). MatchPoint ვერ ხედავს და არ ინახავს ბარათის სრულ ნომერს, ვადას ან CVV კოდს.",
          ],
        },
        {
          h: "3. დადასტურება",
          body: [
            "წარმატებული გადახდის შემდეგ ჯავშანი დასტურდება ავტომატურად და დადასტურება იგზავნება თქვენს ელ. ფოსტაზე. თუ გადახდა არ შედგა, თანხა არ ჩამოიჭრება და ჯავშანი არ იქმნება.",
          ],
        },
        {
          h: "4. მომსახურების მიწოდება",
          body: [
            "ფიზიკური პროდუქტის მიწოდება არ ხორციელდება: მომსახურება გეწევათ კლუბში, მისამართზე " +
              C.addressKa +
              ", ჯავშანში მითითებულ დროს.",
          ],
        },
        {
          h: "5. კითხვები",
          body: [`გადახდასთან დაკავშირებით დაგვიკავშირდით: ${C.phone}, ${C.email}.`],
        },
      ],
    },
    en: {
      title: "Payments & Security",
      intro: "Online payments are processed on the secure page of our licensed payment provider, Flitt.",
      sections: [
        {
          h: "1. Payment methods",
          body: [
            "We accept Visa and Mastercard cards, Google Pay and Apple Pay. All amounts are shown and charged in Georgian lari (₾). If your card is in another currency, your bank handles the conversion.",
          ],
        },
        {
          h: "2. Security",
          body: [
            "You enter your card details directly on Flitt's secure page (HTTPS, PCI DSS, 3-D Secure). MatchPoint never sees or stores your full card number, expiry date or CVV.",
          ],
        },
        {
          h: "3. Confirmation",
          body: [
            "After a successful payment your booking is confirmed automatically and a confirmation is emailed to you. If a payment fails, nothing is charged and no booking is made.",
          ],
        },
        {
          h: "4. Service delivery",
          body: [
            `Nothing is shipped: the service is provided at the club, ${C.addressEn}, at the booked time.`,
          ],
        },
        {
          h: "5. Questions",
          body: [`For payment questions contact ${C.phone}, ${C.email}.`],
        },
      ],
    },
  },
};
