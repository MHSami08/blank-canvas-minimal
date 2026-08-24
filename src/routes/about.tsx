import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Upload,
  Binary,
  MoveVertical,
  Crop,
  Save,
  FileArchive,
  CloudUpload,
  ShieldCheck,
  Zap,
  CheckCircle2,
  Sparkles,
  ArrowLeft,
  Languages,
} from "lucide-react";
import { useFooterLang, LangToggle } from "@/lib/footer-lang";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About this Webapp — Page Renamer Pro" },
      { name: "description", content: "Learn what Page Renamer Pro does, why it was built, and how it helps you organize notebook pages and photos." },
      { property: "og:title", content: "About this Webapp — Page Renamer Pro" },
      { property: "og:description", content: "Learn what Page Renamer Pro does, why it was built, and how it helps you organize notebook pages and photos." },
    ],
  }),
  component: AboutPage,
});

const T = {
  en: {
    back: "Back to app",
    badge: "Note Digitization Made Easy",
    title: "Page Renamer Pro",
    intro:
      "A privacy-first web application for organizing, cropping, reordering, and batch-renaming scanned notebook pages and photos.",
    whyTitle: "Why We Built This",
    why1a: "Photographing physical study notes or teaching materials often leaves you with a camera roll filled with messy default names like ",
    why1b: ". Sorting page numbers, trimming margins, and editing file names manually is slow and error-prone.",
    why2: "Page Renamer Pro removes that friction. It gives students and teachers a visual workspace to sort, crop, and package documents cleanly without compromising privacy or relying on heavy software.",
    featuresTitle: "Key Features",
    featuresSub: "Everything built into Page Renamer Pro for note organization.",
    benefitsTitle: "Benefits at a Glance",
    developedBy: "Developed by",
    features: [
      { title: "Batch Image Upload", desc: "Drop or select multiple photos at once. Supports JPG, JPEG, PNG, and WEBP formats seamlessly." },
      { title: "Smart Sequential Renaming", desc: "Set a custom base name and starting page number. The app auto-numbers the rest in clean sequences." },
      { title: "Bilingual Labels", desc: "Switch between English (Page-01) and Bangla (পৃষ্ঠা-০১) naming schemes with a single click." },
      { title: "Drag & Drop Reordering", desc: "Rearrange pages effortlessly using drag handles so the final document sequence matches your physical notebook." },
      { title: "MIUI-Style Crop Editor", desc: "Fine-tune margins, rotate, flip, or apply preset aspect ratios (1:1, 3:4, 16:9, etc.) per image or in batches." },
      { title: "Session Auto-Recovery", desc: "Your progress auto-saves to your browser's IndexedDB. Pick up right where you left off if you refresh or close the tab." },
      { title: "One-Click ZIP Export", desc: "Bundle all transformed files into an organized, page-range-labeled ZIP archive ready for distribution." },
      { title: "Optional Google Drive Sync", desc: "Directly export processed batches to a central or team Google Drive folder using secure OAuth flow." },
      { title: "100% Client-Side Privacy", desc: "All cropping, scaling, and renaming operations run locally on your device. Your photos are never sent to external servers." },
    ],
    benefits: [
      "Saves hours spent manually editing filenames one by one",
      "Prevents missing or out-of-order pages with visual reordering",
      "Protects confidential notes through client-side browser processing",
      "Works offline after page load for core image operations",
      "Zero app store downloads, sign-ups, or software setup required",
      "Fully responsive interface designed for phones, tablets, and desktops",
    ],
  },
  bn: {
    back: "অ্যাপে ফিরে যান",
    badge: "নোট ডিজিটাইজেশন সহজভাবে",
    title: "Page Renamer Pro",
    intro:
      "স্ক্যান করা নোটবুকের পৃষ্ঠা ও ছবি সাজানো, ক্রপ করা, ক্রম পরিবর্তন এবং একসাথে নাম পরিবর্তনের জন্য একটি প্রাইভেসি-ফার্স্ট ওয়েব অ্যাপ্লিকেশন।",
    whyTitle: "আমরা কেন এটি তৈরি করেছি",
    why1a: "পড়ার নোট বা শিক্ষার উপকরণের ছবি তোলার পর প্রায়ই ক্যামেরা রোলে এলোমেলো নামের ফাইল থাকে যেমন ",
    why1b: "। পৃষ্ঠা নম্বর সাজানো, মার্জিন কাটা এবং একে একে নাম পরিবর্তন করা ধীর ও ভুলপ্রবণ কাজ।",
    why2: "Page Renamer Pro এই ঝামেলা দূর করে। এটি শিক্ষার্থী ও শিক্ষকদের জন্য একটি ভিজ্যুয়াল ওয়ার্কস্পেস দেয় যেখানে প্রাইভেসি বজায় রেখে ও ভারী সফটওয়্যার ছাড়াই ডকুমেন্ট সাজানো, ক্রপ করা ও প্যাকেজ করা যায়।",
    featuresTitle: "প্রধান ফিচারসমূহ",
    featuresSub: "নোট গোছানোর জন্য Page Renamer Pro-এ যা যা আছে।",
    benefitsTitle: "এক নজরে সুবিধা",
    developedBy: "তৈরি করেছেন",
    features: [
      { title: "ব্যাচ ইমেজ আপলোড", desc: "একসাথে একাধিক ছবি ড্রপ বা সিলেক্ট করুন। JPG, JPEG, PNG এবং WEBP ফরম্যাট সাপোর্ট করে।" },
      { title: "স্মার্ট সিরিয়াল রিনেমিং", desc: "একটি বেস নাম ও শুরুর পৃষ্ঠা নম্বর দিন। বাকি সব ফাইল স্বয়ংক্রিয়ভাবে ক্রমিকভাবে নামকরণ হবে।" },
      { title: "দ্বিভাষিক লেবেল", desc: "এক ক্লিকেই English (Page-01) এবং বাংলা (পৃষ্ঠা-০১) নামকরণের মধ্যে পরিবর্তন করুন।" },
      { title: "ড্র্যাগ ও ড্রপে ক্রম পরিবর্তন", desc: "ড্র্যাগ হ্যান্ডেল ব্যবহার করে পৃষ্ঠা সহজেই পুনর্বিন্যাস করুন যাতে চূড়ান্ত ক্রম আপনার নোটবুকের সাথে মিলে।" },
      { title: "MIUI-স্টাইল ক্রপ এডিটর", desc: "মার্জিন ঠিক করা, রোটেট, ফ্লিপ বা প্রিসেট অ্যাসপেক্ট রেশিও (1:1, 3:4, 16:9 ইত্যাদি) প্রতিটি ছবিতে বা ব্যাচে প্রয়োগ করুন।" },
      { title: "সেশন অটো-রিকভারি", desc: "আপনার কাজ ব্রাউজারের IndexedDB-তে স্বয়ংক্রিয়ভাবে সেভ হয়। রিফ্রেশ বা ট্যাব বন্ধ হলেও ঠিক যেখানে ছিলেন সেখান থেকে শুরু করুন।" },
      { title: "এক ক্লিকে ZIP এক্সপোর্ট", desc: "সব ফাইল একটি সংগঠিত, পৃষ্ঠা-রেঞ্জ লেবেলযুক্ত ZIP আর্কাইভে বান্ডেল করুন।" },
      { title: "ঐচ্ছিক Google Drive সিঙ্ক", desc: "নিরাপদ OAuth ফ্লোতে সরাসরি Google Drive ফোল্ডারে প্রসেস করা ব্যাচ পাঠান।" },
      { title: "১০০% ক্লায়েন্ট-সাইড প্রাইভেসি", desc: "সব ক্রপিং, স্কেলিং ও রিনেমিং আপনার ডিভাইসে চলে। আপনার ছবি কখনো বাইরের সার্ভারে যায় না।" },
    ],
    benefits: [
      "একে একে ফাইলের নাম বদলানোর ঘন্টার পর ঘন্টা বাঁচায়",
      "ভিজ্যুয়াল ক্রম পরিবর্তনে হারানো বা ভুল ক্রমের পৃষ্ঠা এড়ায়",
      "ক্লায়েন্ট-সাইড প্রসেসিংয়ে গোপন নোট সুরক্ষিত থাকে",
      "পেজ লোডের পর মূল ইমেজ অপারেশন অফলাইনেও কাজ করে",
      "কোনো অ্যাপ ডাউনলোড, সাইনআপ বা সফটওয়্যার সেটআপ লাগে না",
      "ফোন, ট্যাবলেট ও ডেস্কটপের জন্য সম্পূর্ণ রেসপন্সিভ ইন্টারফেস",
    ],
  },
} as const;

const ICONS = [Upload, Binary, Languages, MoveVertical, Crop, Save, FileArchive, CloudUpload, ShieldCheck];

function AboutPage() {
  const [lang, setLang] = useFooterLang();
  const t = T[lang];

  return (
    <div className="min-h-screen bg-background text-foreground px-4 py-12 md:py-16">
      <div className="mx-auto max-w-4xl space-y-12">
        <div className="flex items-center justify-between gap-3">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors">
            <ArrowLeft className="w-4 h-4" />
            {t.back}
          </Link>
          <LangToggle lang={lang} onChange={setLang} />
        </div>

        <section className="text-center space-y-4 max-w-2xl mx-auto">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent text-accent-foreground text-xs font-semibold border border-border">
            <Sparkles className="w-3.5 h-3.5 text-primary" />
            {t.badge}
          </div>
          <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">{t.title}</h1>
          <p className="text-sm md:text-base text-muted-foreground leading-relaxed">{t.intro}</p>
        </section>

        <section className="p-6 md:p-8 rounded-2xl bg-card border border-border space-y-3">
          <h2 className="text-xl font-bold flex items-center gap-2">
            <Zap className="w-5 h-5 text-primary" />
            {t.whyTitle}
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {t.why1a}
            <code className="px-1.5 py-0.5 rounded bg-muted text-foreground text-xs font-mono">IMG_2034.jpg</code>
            {t.why1b}
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">{t.why2}</p>
        </section>

        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-bold">{t.featuresTitle}</h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">{t.featuresSub}</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {t.features.map((feature, idx) => {
              const Icon = ICONS[idx];
              return (
                <div key={idx} className="p-5 rounded-2xl bg-card border border-border hover:border-primary/50 transition-all flex flex-col justify-between">
                  <div className="space-y-3">
                    <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
                      <Icon className="w-4.5 h-4.5" />
                    </div>
                    <h3 className="font-semibold text-base">{feature.title}</h3>
                    <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="p-6 md:p-8 rounded-2xl bg-card border border-border space-y-6">
          <h2 className="text-xl font-bold">{t.benefitsTitle}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {t.benefits.map((benefit, idx) => (
              <div key={idx} className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <span className="text-xs md:text-sm text-muted-foreground">{benefit}</span>
              </div>
            ))}
          </div>
        </section>

        <footer className="pt-6 border-t border-border text-center">
          <p className="text-xs text-muted-foreground">
            {t.developedBy} <span className="font-semibold text-foreground">MH Sami</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
