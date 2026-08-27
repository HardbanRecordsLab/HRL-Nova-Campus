import React, { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";

export const CourseCatalog: React.FC = () => {
  const [courses, setCourses] = useState<any[]>([]);

  useEffect(() => {
    fetch("/api/courses")
      .then((res) => res.json())
      .then((data) => setCourses(data))
      .catch(console.error);
  }, []);

  return (
    <div className="bg-zinc-900/40 border border-zinc-800 rounded-2xl p-6">
      <h3 className="text-sm font-mono uppercase tracking-wider text-white mb-4 flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-violet-400" />
        Dostępne kursy do rozpoczęcia
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {courses.map((course) => (
          <div key={course.id} className="p-4 bg-zinc-950 border border-zinc-850 rounded-xl">
            <h4 className="text-sm font-bold text-white mb-2">{course.title}</h4>
            <p className="text-xs text-zinc-400 mb-4">{course.description}</p>
            <button className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-mono rounded-lg">
              Poznaj kurs
            </button>
          </div>
        ))}
      </div>
    </div>
  );
};
