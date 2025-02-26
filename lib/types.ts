export interface User {
  id: string;
  email: string;
  hashed_password: string;
  subscription: {
    external: Record<never, never>;
    expires_at: string;
    updated_at: string;
  };
  status: 'trial' | 'active' | 'inactive';
  extra: {
    is_email_verified: boolean;
    is_admin?: boolean;
    dav_hashed_password?: string;
    expenses_currency?: SupportedCurrencySymbol;
  };
  created_at: Date;
}

export interface UserSession {
  id: string;
  user_id: string;
  expires_at: Date;
  last_seen_at: Date;
  created_at: Date;
}

export interface FreshContextState {
  user?: User;
  session?: UserSession;
}

export interface VerificationCode {
  id: string;
  user_id: string;
  code: string;
  verification: {
    type: 'email';
    id: string;
  };
  expires_at: Date;
  created_at: Date;
}

export interface DashboardLink {
  url: string;
  name: string;
}

export interface Dashboard {
  id: string;
  user_id: string;
  data: {
    links: DashboardLink[];
    notes: string;
  };
  created_at: Date;
}

export type NewsFeedType = 'rss' | 'atom' | 'json';
export type NewsFeedCrawlType = 'direct' | 'googlebot' | 'proxy';

export interface NewsFeed {
  id: string;
  user_id: string;
  feed_url: string;
  last_crawled_at: Date | null;
  extra: {
    title?: string;
    feed_type?: NewsFeedType;
    crawl_type?: NewsFeedCrawlType;
  };
  created_at: Date;
}

export interface NewsFeedArticle {
  id: string;
  user_id: string;
  feed_id: string;
  article_url: string;
  article_title: string;
  article_summary: string;
  article_date: Date;
  is_read: boolean;
  extra: Record<never, never>; // NOTE: Here for potential future fields
  created_at: Date;
}

export interface Directory {
  user_id: string;
  parent_path: string;
  directory_name: string;
  has_write_access: boolean;
  size_in_bytes: number;
  updated_at: Date;
  created_at: Date;
}

export interface DirectoryFile {
  user_id: string;
  parent_path: string;
  file_name: string;
  has_write_access: boolean;
  size_in_bytes: number;
  updated_at: Date;
  created_at: Date;
}

export interface Budget {
  id: string;
  user_id: string;
  name: string;
  month: string;
  value: number;
  extra: {
    usedValue: number;
    availableValue: number;
  };
  created_at: Date;
}

export interface Expense {
  id: string;
  user_id: string;
  cost: number;
  description: string;
  budget: string;
  date: string;
  is_recurring: boolean;
  extra: Record<never, never>; // NOTE: Here for potential future fields
  created_at: Date;
}

export type SupportedCurrencySymbol = '$' | '€' | '£' | '¥' | '₹';
type SupportedCurrency = 'USD' | 'EUR' | 'GBP' | 'JPY' | 'INR';

export const currencyMap = new Map<SupportedCurrencySymbol, SupportedCurrency>([
  ['$', 'USD'],
  ['€', 'EUR'],
  ['£', 'GBP'],
  ['¥', 'JPY'],
  ['₹', 'INR'],
]);
