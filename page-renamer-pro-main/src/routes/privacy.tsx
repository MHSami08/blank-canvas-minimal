import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ShieldCheck,
  HardDrive,
  UserCheck,
  CloudUpload,
  Cookie,
  Trash2,
  Baby,
  RefreshCw,
  Mail,
  ArrowLeft,
  MessageCircle,
} from "lucide-react";
import { useFooterLang, LangToggle } from "@/lib/footer-lang";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Page Renamer Pro" },
      { name: "description", content: "How Page Renamer Pro handles your data. All image processing runs locally in your browser." },
      { property: "og:title", content: "Privacy Policy — Page Renamer Pro" },
      { property: "og:description", content: "How Page Renamer Pro handles your data. All image processing runs locally in your browser." },
    ],
  }),
  component: PrivacyPage,
});

const T = {
  en: {
    back: "Back to app",
    badge: "Privacy First",
    title: "Privacy Policy",
    updated: "Last updated: July 19, 2026",
    intro:
      'This Privacy Policy explains how Page Renamer Pro ("we", "our", "the app") handles information when you use our website. We built this app to be privacy-first: your images never leave your device unless you explicitly choose to upload them to a third-party service.',
    contactTitle: "9. Have Questions?",
    contactText: "Questions about this policy? Reach out to the developer, MH Sami via WhatsApp:",
    developedBy: "Developed by MH Sami",
    sections: [
      { title: "1. Local, In-Browser Processing", content: "All image uploads, cropping, renaming, reordering, and ZIP creation happen entirely inside your browser. Your images are not transmitted to our servers. We do not store, view, or have access to your notebook pages or any files you load into the app." },
      { title: "2. Local Storage", content: "To let you recover work after a refresh or crash, the app saves your current session (images, order, crops, settings) in your browser's IndexedDB. This data stays on your device. You can clear it any time from the Settings menu (\"Clear Saved Session\")." },
      { title: "3. Authentication (Clerk)", content: "If you sign in, we use Clerk to handle authentication. Clerk stores your account email, name, and profile image, and issues a session token so you stay signed in. Clerk's own privacy practices apply to that data. We do not receive your password." },
      { title: "4. Google Drive Upload (Optional)", content: "If you choose to upload the resulting ZIP or files to Google Drive, you authorize the app to send those files to your Google Drive account through Google's OAuth flow. We do not retain a copy of what you upload. Google's privacy policy governs storage inside your Drive." },
      { title: "5. Cookies & Analytics", content: "The app itself does not set marketing or advertising cookies. Clerk may set functional cookies necessary for authentication. We do not run third-party ad networks." },
      { title: "6. Data Retention & Deletion", content: "Session data lives on your device until you clear it. If you signed in, you can request deletion of your Clerk account by contacting us; that removes your identity data associated with the app." },
      { title: "7. Children's Privacy", content: "The app is not directed to children under 13. Please do not create an account or use the service if you are under that age." },
      { title: "8. Policy Changes", content: "We may update this policy from time to time. Changes take effect when posted on this page." },
    ],
  },
  bn: {
    back: "অ্যাপে ফিরে যান",
    badge: "প্রাইভেসি সর্বাগ্রে",
    title: "প্রাইভেসি পলিসি",
    updated: "সর্বশেষ আপডেট: ১৯ জুলাই, ২০২৬",
    intro:
      'এই প্রাইভেসি পলিসি ব্যাখ্যা করে Page Renamer Pro ("আমরা", "আমাদের", "অ্যাপ") আপনার ওয়েবসাইট ব্যবহারের সময় তথ্য কীভাবে হ্যান্ডল করে। আমরা এই অ্যাপকে প্রাইভেসি-ফার্স্ট হিসেবে তৈরি করেছি: আপনি নিজে থেকে কোনো তৃতীয়-পক্ষ সার্ভিসে আপলোড করার সিদ্ধান্ত না নিলে আপনার ছবি কখনো আপনার ডিভাইস ছাড়ে না।',
    contactTitle: "৯. প্রশ্ন আছে?",
    contactText: "এই পলিসি সম্পর্কে প্রশ্ন? WhatsApp-এ ডেভেলপার MH Sami-এর সাথে যোগাযোগ করুন:",
    developedBy: "তৈরি করেছেন MH Sami",
    sections: [
      { title: "১. লোকাল, ইন-ব্রাউজার প্রসেসিং", content: "সব ইমেজ আপলোড, ক্রপিং, রিনেমিং, ক্রম পরিবর্তন ও ZIP তৈরি সম্পূর্ণভাবে আপনার ব্রাউজারের ভেতরে হয়। আপনার ছবি আমাদের সার্ভারে পাঠানো হয় না। আপনি অ্যাপে লোড করা কোনো ফাইল আমরা স্টোর, দেখা বা অ্যাক্সেস করি না।" },
      { title: "২. লোকাল স্টোরেজ", content: "রিফ্রেশ বা ক্র্যাশের পর কাজ পুনরুদ্ধারের জন্য অ্যাপ আপনার বর্তমান সেশন (ছবি, ক্রম, ক্রপ, সেটিংস) আপনার ব্রাউজারের IndexedDB-তে সেভ করে। এই ডেটা আপনার ডিভাইসেই থাকে। Settings মেনু থেকে (\"Clear Saved Session\") যেকোনো সময় মুছে ফেলতে পারেন।" },
      { title: "৩. অথেন্টিকেশন (Clerk)", content: "আপনি সাইন ইন করলে অথেন্টিকেশনের জন্য আমরা Clerk ব্যবহার করি। Clerk আপনার অ্যাকাউন্টের ইমেইল, নাম ও প্রোফাইল ইমেজ সংরক্ষণ করে এবং সেশন টোকেন ইস্যু করে যাতে আপনি সাইন ইন থাকেন। সেই ডেটার জন্য Clerk-এর নিজস্ব প্রাইভেসি নীতি প্রযোজ্য। আমরা আপনার পাসওয়ার্ড পাই না।" },
      { title: "৪. Google Drive আপলোড (ঐচ্ছিক)", content: "আপনি চাইলে ZIP বা ফাইল Google Drive-এ আপলোড করতে পারেন, তখন Google-এর OAuth ফ্লোর মাধ্যমে অ্যাপকে আপনার Drive-এ ফাইল পাঠানোর অনুমতি দেন। আপনি যা আপলোড করেন তার কোনো কপি আমরা রাখি না। আপনার Drive-এর ভেতরের স্টোরেজে Google-এর প্রাইভেসি পলিসি প্রযোজ্য।" },
      { title: "৫. কুকিজ ও অ্যানালিটিক্স", content: "অ্যাপ নিজে কোনো মার্কেটিং বা বিজ্ঞাপন কুকি সেট করে না। Clerk অথেন্টিকেশনের জন্য প্রয়োজনীয় ফাংশনাল কুকি সেট করতে পারে। আমরা কোনো তৃতীয়-পক্ষ বিজ্ঞাপন নেটওয়ার্ক চালাই না।" },
      { title: "৬. ডেটা রিটেনশন ও ডিলিশন", content: "আপনি না মোছা পর্যন্ত সেশন ডেটা আপনার ডিভাইসে থাকে। সাইন ইন করে থাকলে আমাদের সাথে যোগাযোগ করে Clerk অ্যাকাউন্ট ডিলিট করাতে পারেন; এটি অ্যাপের সাথে যুক্ত আপনার আইডেন্টিটি ডেটা মুছে ফেলে।" },
      { title: "৭. শিশুদের প্রাইভেসি", content: "এই অ্যাপ ১৩ বছরের নিচের শিশুদের জন্য উদ্দেশ্য করা নয়। এর কম বয়স হলে অনুগ্রহ করে অ্যাকাউন্ট তৈরি বা সার্ভিস ব্যবহার করবেন না।" },
      { title: "৮. পলিসি পরিবর্তন", content: "আমরা সময়ে সময়ে এই পলিসি আপডেট করতে পারি। এই পেজে পোস্ট করা হলে পরিবর্তন কার্যকর হয়।" },
    ],
  },
} as const;

const ICONS = [ShieldCheck, HardDrive, UserCheck, CloudUpload, Cookie, Trash2, Baby, RefreshCw];

function PrivacyPage() {
  const [lang, setLang] = useFooterLang();
  const t = T[lang];

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-10">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t.back}
          </Link>
          <LangToggle lang={lang} onChange={setLang} />
        </div>

        <header className="space-y-2 border-b border-border pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
            <ShieldCheck className="w-3.5 h-3.5" />
            {t.badge}
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{t.title}</h1>
          <p className="text-xs text-muted-foreground">{t.updated}</p>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed pt-2">{t.intro}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {t.sections.map((sec, idx) => {
            const Icon = ICONS[idx];
            return (
              <div key={idx} className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h2 className="font-semibold text-base">{sec.title}</h2>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{sec.content}</p>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-6 rounded-2xl bg-card border border-border flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-2">
            <h3 className="font-bold text-base flex items-center gap-2">
              <Mail className="w-4 h-4 text-primary" />
              {t.contactTitle}
            </h3>
            <p className="text-xs md:text-sm text-muted-foreground">{t.contactText}</p>
            <a
              href="https://wa.me/8801724583309"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
            >
              <MessageCircle className="w-4 h-4" />
              +8801724583309
            </a>
          </div>
          <p className="text-xs font-medium text-foreground bg-muted px-3 py-1.5 rounded-lg shrink-0">
            {t.developedBy}
          </p>
        </div>
      </div>
    </div>
  );
}
