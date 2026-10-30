-- Notes, ticked steps, ratings and quiz answers a learner keeps inside an interactive course (one row per learner and course).
CREATE TABLE "CourseWork" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "courseId" TEXT NOT NULL,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CourseWork_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CourseWork_userId_courseId_key" ON "CourseWork"("userId", "courseId");

ALTER TABLE "CourseWork" ADD CONSTRAINT "CourseWork_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CourseWork" ADD CONSTRAINT "CourseWork_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "Course"("id") ON DELETE CASCADE ON UPDATE CASCADE;
