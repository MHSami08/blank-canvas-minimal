import { createFileRoute, Link } from "@tanstack/react-router";
import {
  FileText,
  Image as ImageIcon,
  CheckCircle,
  KeyRound,
  ExternalLink,
  AlertTriangle,
  ShieldAlert,
  Ban,
  History,
  Mail,
  ArrowLeft,
  MessageCircle,
} from "lucide-react";
import { useFooterLang, LangToggle } from "@/lib/footer-lang";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Page Renamer Pro" },
      { name: "description", content: "The terms that govern your use of Page Renamer Pro." },
      { property: "og:title", content: "Terms of Service — Page Renamer Pro" },
      { property: "og:description", content: "The terms that govern your use of Page Renamer Pro." },
    ],
  }),
  component: TermsPage,
});

const T = {
  en: {
    back: "Back to app",
    badge: "Legal Agreement",
    title: "Terms of Service",
    updated: "Last updated: July 19, 2026",
    intro:
      'By accessing or using Page Renamer Pro (the "Service"), you agree to these Terms of Service. If you do not agree, please do not use the Service.',
    contactTitle: "10. Contact Information",
    contactText: "For questions about these Terms, contact the developer, MH Sami via WhatsApp:",
    developedBy: "Developed by MH Sami",
    terms: [
      { title: "1. The Service", content: "Page Renamer Pro is a browser-based tool that lets you upload notebook page images, crop and reorder them, rename them with a base name and page numbers, and download them as a ZIP. Optional integrations (such as Google Drive upload and Clerk sign-in) may be offered." },
      { title: "2. Your Content", content: "You retain all rights to the images you process through the Service. Because processing happens locally in your browser, we do not claim any license over your content. You are responsible for ensuring you have the right to upload and process any images you use." },
      { title: "3. Acceptable Use", content: "You agree not to: (a) use the Service for any unlawful purpose; (b) process content that infringes intellectual property, privacy, or other rights; (c) attempt to disrupt, reverse engineer, or overload the Service; or (d) misuse third-party integrations such as Google Drive in violation of their terms." },
      { title: "4. Accounts", content: "If you sign in via Clerk, you are responsible for the activity that occurs under your account. Keep your credentials secure and notify us of any unauthorized use." },
      { title: "5. Third-Party Services", content: "The Service uses Clerk for authentication and, optionally, Google Drive for uploads. Your use of those services is subject to their respective terms and privacy policies. We are not responsible for third-party outages, data loss, or policy changes." },
      { title: "6. No Warranty", content: "The Service is provided \"as is\" and \"as available\", without warranties of any kind, express or implied. We do not guarantee that the Service will be error-free, uninterrupted, or that outputs will be perfectly accurate. Always keep independent backups of important images." },
      { title: "7. Limitation of Liability", content: "To the maximum extent permitted by law, the developer of Page Renamer Pro shall not be liable for any indirect, incidental, special, consequential, or punitive damages, or any loss of data, arising from your use of the Service." },
      { title: "8. Termination", content: "We may suspend or discontinue the Service, or your access to it, at any time and without notice. You may stop using the Service at any time." },
      { title: "9. Changes to These Terms", content: "We may update these Terms occasionally. Continued use of the Service after changes are posted means you accept the updated Terms." },
    ],
  },
  bn: {
    back: "অ্যাপে ফিরে যান",
    badge: "আইনি চুক্তি",
    title: "সার্ভিসের শর্তাবলি",
    updated: "সর্বশেষ আপডেট: ১৯ জুলাই, ২০২৬",
    intro:
      'Page Renamer Pro ("সার্ভিস") ব্যবহারের মাধ্যমে আপনি এই শর্তাবলিতে সম্মত হচ্ছেন। সম্মত না হলে অনুগ্রহ করে সার্ভিস ব্যবহার করবেন না।',
    contactTitle: "১০. যোগাযোগের তথ্য",
    contactText: "এই শর্তাবলি সম্পর্কে প্রশ্নের জন্য WhatsApp-এ ডেভেলপার MH Sami-এর সাথে যোগাযোগ করুন:",
    developedBy: "তৈরি করেছেন MH Sami",
    terms: [
      { title: "১. সার্ভিস", content: "Page Renamer Pro একটি ব্রাউজার-ভিত্তিক টুল যা আপনাকে নোটবুকের পৃষ্ঠার ছবি আপলোড, ক্রপ ও পুনর্বিন্যাস, বেস নাম ও পৃষ্ঠা নম্বর দিয়ে রিনেম এবং ZIP আকারে ডাউনলোড করতে দেয়। ঐচ্ছিক ইন্টিগ্রেশন (যেমন Google Drive আপলোড ও Clerk সাইন-ইন) থাকতে পারে।" },
      { title: "২. আপনার কন্টেন্ট", content: "সার্ভিসের মাধ্যমে প্রসেস করা ছবির সব অধিকার আপনার। যেহেতু প্রসেসিং আপনার ব্রাউজারে স্থানীয়ভাবে হয়, আমরা আপনার কন্টেন্টের ওপর কোনো লাইসেন্স দাবি করি না। আপনি যে ছবি ব্যবহার করছেন সেটির অধিকার আছে কিনা তা নিশ্চিত করার দায়িত্ব আপনার।" },
      { title: "৩. গ্রহণযোগ্য ব্যবহার", content: "আপনি সম্মত হচ্ছেন যে: (ক) কোনো বেআইনি উদ্দেশ্যে সার্ভিস ব্যবহার করবেন না; (খ) মেধাসম্পদ, প্রাইভেসি বা অন্য কোনো অধিকার লঙ্ঘন করে এমন কন্টেন্ট প্রসেস করবেন না; (গ) সার্ভিস বিঘ্নিত, রিভার্স ইঞ্জিনিয়ার বা ওভারলোড করার চেষ্টা করবেন না; (ঘ) Google Drive-এর মতো তৃতীয়-পক্ষ ইন্টিগ্রেশন তাদের শর্ত লঙ্ঘন করে ব্যবহার করবেন না।" },
      { title: "৪. অ্যাকাউন্ট", content: "Clerk-এর মাধ্যমে সাইন ইন করলে আপনার অ্যাকাউন্টে হওয়া কার্যক্রমের জন্য আপনি দায়ী। আপনার ক্রেডেনশিয়াল সুরক্ষিত রাখুন এবং কোনো অননুমোদিত ব্যবহার হলে আমাদের জানান।" },
      { title: "৫. তৃতীয়-পক্ষ সার্ভিস", content: "সার্ভিস অথেন্টিকেশনের জন্য Clerk এবং ঐচ্ছিকভাবে আপলোডের জন্য Google Drive ব্যবহার করে। সেগুলোর ব্যবহারে তাদের নিজস্ব শর্ত ও প্রাইভেসি পলিসি প্রযোজ্য। তৃতীয়-পক্ষের আউটেজ, ডেটা লস বা পলিসি পরিবর্তনের জন্য আমরা দায়ী নই।" },
      { title: "৬. কোনো ওয়ারেন্টি নেই", content: "সার্ভিসটি \"যেমন আছে\" এবং \"যেভাবে পাওয়া যায়\" ভিত্তিতে প্রদান করা হয়, কোনো প্রকার ওয়ারেন্টি ছাড়া। সার্ভিসটি ত্রুটিমুক্ত, নিরবচ্ছিন্ন বা আউটপুট নিখুঁত হবে এমন গ্যারান্টি নেই। গুরুত্বপূর্ণ ছবির স্বতন্ত্র ব্যাকআপ রাখুন।" },
      { title: "৭. দায়বদ্ধতার সীমা", content: "আইনের সর্বোচ্চ অনুমোদিত সীমা পর্যন্ত, Page Renamer Pro-এর ডেভেলপার সার্ভিস ব্যবহারের ফলে সৃষ্ট কোনো পরোক্ষ, আনুষঙ্গিক, বিশেষ, ফলস্বরূপ বা শাস্তিমূলক ক্ষতির জন্য দায়ী থাকবেন না।" },
      { title: "৮. সমাপ্তি", content: "আমরা যেকোনো সময় বিনা নোটিশে সার্ভিস বা আপনার অ্যাক্সেস স্থগিত বা বন্ধ করতে পারি। আপনিও যেকোনো সময় সার্ভিস ব্যবহার বন্ধ করতে পারেন।" },
      { title: "৯. শর্তাবলির পরিবর্তন", content: "আমরা মাঝে মাঝে এই শর্তাবলি আপডেট করতে পারি। পরিবর্তন পোস্ট হওয়ার পরও সার্ভিস ব্যবহার চালিয়ে গেলে আপনি আপডেটেড শর্তাবলিতে সম্মত হন।" },
    ],
  },
} as const;

const ICONS = [FileText, ImageIcon, CheckCircle, KeyRound, ExternalLink, AlertTriangle, ShieldAlert, Ban, History];

function TermsPage() {
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
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold border border-border">
            <FileText className="w-3.5 h-3.5 text-primary" />
            {t.badge}
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight">{t.title}</h1>
          <p className="text-xs text-muted-foreground">{t.updated}</p>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed pt-2">{t.intro}</p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {t.terms.map((term, idx) => {
            const Icon = ICONS[idx];
            return (
              <div key={idx} className="p-5 rounded-2xl bg-card border border-border flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                    <Icon className="w-4 h-4" />
                  </div>
                  <h2 className="font-semibold text-base">{term.title}</h2>
                  <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{term.content}</p>
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
