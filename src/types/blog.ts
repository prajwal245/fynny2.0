export interface BlogPost {
  id: string;
  title: string;
  slug: string;
  content: string;
  excerpt: string;
  cover_image_url: string | null;
  category: string;
  tags: string[];
  status: "published" | "draft" | "scheduled" | "archived";
  author_name: string;
  reading_time_minutes: number;
  is_featured: boolean;
  seo_title: string | null;
  seo_description: string | null;
  og_image: string | null;
  published_at: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
  views: number;
}

export const BLOG_CATEGORIES = [
  "Playbooks",
  "Cash flow",
  "GST",
  "Runway",
  "Investor updates",
  "Product updates",
  "Founder stories",
  "MSME",
  "Startup finance",
  "Compliance",
  "CA resources",
  "Hiring",
  "Other",
];

