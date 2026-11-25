# উত্তর নলটেক সমাজ কল্যাণ সংগঠন — অ্যাপের প্রথম সংস্করণ

এটি Firebase-সংযুক্ত একটি **ওয়েব/PWA অ্যাপের সোর্স কোড**, এখনো APK/AAB নয়। মোবাইল ব্রাউজার থেকে ইনস্টলযোগ্য করতে Hosting-এ HTTPS দিয়ে প্রকাশ করতে হবে।

## এই সংস্করণে
- Firebase Phone OTP sign-in UI (Firebase Console-এ Phone provider চালু থাকতে হবে)
- প্রথম লগইনের পর সদস্যের আবেদন `pending` হিসেবে Firestore-এ সংরক্ষণ
- অনুমোদিত সদস্যের হোম ও নোটিশ দেখা
- অ্যাডমিনের জন্য pending আবেদন অনুমোদন ও নোটিশ প্রকাশের প্রাথমিক UI
- Firestore security rules

## জরুরি সেটআপ
1. Firebase Console → Authentication → Settings → Authorized domains-এ আপনার Hosting domain যোগ করুন (Firebase Hosting হলে সাধারণত স্বয়ংক্রিয়ভাবে থাকে)।
2. Authentication → Sign-in method → Phone চালু রাখুন। বাস্তব OTP-তে SMS quota/বিলিং/দেশভিত্তিক সীমা থাকতে পারে; আগে পরীক্ষামূলকভাবে যাচাই করুন।
3. Firestore → Rules-এ `firestore.rules` ফাইলের নিয়ম প্রকাশ করুন।
4. প্রথম অ্যাডমিন করতে: অ্যাপে নিজের নম্বর দিয়ে একবার OTP লগইন করুন। Authentication → Users থেকে নিজের UID কপি করুন। Firestore → `users` collection-এ ওই UID-র document খুলে `role` string `admin` করুন এবং `status` string `approved` করুন। কাউকে OTP বা পাসওয়ার্ড দেবেন না।
5. প্রকল্প root-এ `npm install` চালিয়ে `npm run build` করুন। `dist` ফোল্ডার Firebase Hosting-এ deploy করুন। Hosting-এর জন্য Firebase CLI ও Node.js-সহ কম্পিউটার বা বিশ্বস্ত ডেভেলপার লাগবে।

## Android package তথ্য
`google-services.json`-এ package name `uttarnalltek.somajkallyan` আছে। এই ফাইলটি নেটিভ Android Gradle প্রজেক্টে প্রযোজ্য; এই PWA-তে এটি সরাসরি পড়া হয় না। Play Store-এর APK/AAB বানাতে আলাদা Android wrapper/build এবং পরীক্ষা দরকার।

## সীমাবদ্ধতা
- এখনো সদস্যের নাম/ঠিকানা/ছবি ফর্ম, রক্তদাতা, হিসাব, গ্যালারি, পুশ নোটিফিকেশন যোগ করা হয়নি।
- অ্যাডমিনের প্রথম role Firestore Console থেকে একবার সেট করতে হবে।
- বাস্তব সদস্যদের ব্যক্তিগত তথ্য সংগ্রহের আগে privacy notice, consent, access control এবং rules পরীক্ষা আবশ্যক।
- Storage চালু করতে Billing upgrade লাগতে পারে; এখন এই অ্যাপ ছবি আপলোড করে না।
