-- CreateTable
CREATE TABLE "IssueDependency" (
    "dependentId" TEXT NOT NULL,
    "dependsOnId" TEXT NOT NULL,

    CONSTRAINT "IssueDependency_pkey" PRIMARY KEY ("dependentId","dependsOnId")
);

-- AddForeignKey
ALTER TABLE "IssueDependency" ADD CONSTRAINT "IssueDependency_dependentId_fkey" FOREIGN KEY ("dependentId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IssueDependency" ADD CONSTRAINT "IssueDependency_dependsOnId_fkey" FOREIGN KEY ("dependsOnId") REFERENCES "Issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
