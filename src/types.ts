export interface User {
  id: string | number;
  username: string;
  email: string;
  role: "student" | "admin";
}

export interface Course {
  id: string | number;
  title: string;
  description: string;
  thumbnail: string;
  category?: string;
  difficulty?: string;
  instructor_name?: string;
  modules_count?: number;
  lessons_count?: number;
  pricing_model?: "free" | "one_time" | "subscription";
  one_time_price?: number;
  subscription_price?: number;
  subscription_interval?: "month" | "year";
  tenant_domain?: string;
}

export interface Lesson {
  id: number;
  title: string;
  description: string;
  content: string;
  access_level: "free_preview" | "premium";
  video_url: string;
  duration_minutes: number;
  has_access: boolean;
  progress: {
    percent: number;
    completed: number;
  };
}

export interface CourseModule {
  id: number;
  title: string;
  lessons: Lesson[];
}

export interface QuizQuestion {
  id: number;
  lesson_id: number;
  question_text: string;
  option_a: string;
  option_b: string;
  option_c: string;
  option_d: string;
  points_value: number;
}

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "warning" | "info";
}

export interface ActivityLog {
  id: number;
  timestamp: string;
  user_id: number | null;
  event_type: string;
  ip_address: string;
  request_method: string;
  request_path: string;
  status_code: number;
  error_message: string | null;
  payload_snapshot: string | null;
  user_agent: string;
}
