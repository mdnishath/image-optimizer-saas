"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import Image from "next/image";
import { plans } from "@/lib/plans";
import BuyCreditsButton from "@/components/ui/BuyCreditsButton";

export default function DashboardPage() {
  const router = useRouter();
  const [credits, setCredits] = useState<number | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("webp");
  const [quality, setQuality] = useState(80);
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  const [optimizedUrl, setOptimizedUrl] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [stats, setStats] = useState<{ before: number; after: number } | null>(
    null
  );
  const [history, setHistory] = useState<any[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState(plans[0].id);

  const accessToken =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  // ✅ Load credits + user info
  useEffect(() => {
    if (!accessToken) {
      router.push("/login");
      return;
    }
    fetch("/api/user/me", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data) => {
        if (data?.email) {
          setUserEmail(data.email);
          setCredits(data.credits);
        } else {
          router.push("/login");
        }
      })
      .catch(() => router.push("/login"));
  }, [router, accessToken]);

  // ✅ Optimize handler
  const handleOptimize = async () => {
    if (!file || !accessToken) return;

    setOriginalUrl(URL.createObjectURL(file));
    setOptimizedUrl(null);
    setStats(null);
    setProgress(20);

    let res: Response;

    if (file.size < 4 * 1024 * 1024) {
      // Small file → direct optimize
      res = await fetch("/api/images/optimize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "x-format": format,
          "x-quality": quality.toString(),
        },
        body: file,
      });
    } else {
      // Big file → upload first via secure API
      const formData = new FormData();
      formData.append("file", file);

      const uploadRes = await fetch("/api/images/upload", {
        method: "POST",
        body: formData,
      });

      const uploadData = await uploadRes.json();
      if (!uploadRes.ok) {
        alert("Upload failed: " + uploadData.error);
        return;
      }

      // Then optimize by path
      res = await fetch("/api/images/optimize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-format": format,
          "x-quality": quality.toString(),
        },
        body: JSON.stringify({ path: uploadData.path }),
      });
    }

    setProgress(60);

    if (res.ok) {
      const data = await res.json();
      setOptimizedUrl(data.downloadUrl || data.file);
      setStats({ before: data.sizeBefore, after: data.sizeAfter });

      const newLog = {
        id: Date.now(),
        format,
        sizeBefore: data.sizeBefore,
        sizeAfter: data.sizeAfter,
        createdAt: new Date().toISOString(),
        fileUrl: data.downloadUrl || data.file,
      };
      setHistory((prev) => [newLog, ...prev]);

      setProgress(100);
      setTimeout(() => setProgress(0), 1500);

      // Refresh credits
      const creditRes = await fetch("/api/user/credits", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const creditData = await creditRes.json();
      setCredits(creditData.credits);
    } else {
      alert("Optimization failed");
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <Button
          variant="outline"
          onClick={() => {
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");
            router.push("/login");
          }}
        >
          Logout
        </Button>
      </div>

      {/* Credits + Buy Button */}
      <Card>
        <CardHeader>
          <CardTitle>Available Credits</CardTitle>
        </CardHeader>
        <CardContent>
          {credits !== null ? (
            <p>
              You have{" "}
              <span className="font-semibold text-green-600">{credits}</span>{" "}
              credits left
            </p>
          ) : (
            "Loading..."
          )}

          {/* Plan selector + Freemius Buy button */}
          {userEmail && (
            <div className="mt-6">
              <label className="block text-sm font-medium mb-2">
                Choose a Plan
              </label>
              <select
                value={selectedPlan}
                onChange={(e) => setSelectedPlan(e.target.value)}
                className="border rounded px-3 py-2"
              >
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.name} – {plan.price}
                  </option>
                ))}
              </select>

              <div className="mt-4">
                <BuyCreditsButton planId={selectedPlan} userEmail={userEmail} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Upload & Optimize */}
      <Card>
        <CardHeader>
          <CardTitle>Optimize an Image</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          <Input
            type="file"
            accept="image/*"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
          />

          <div className="flex gap-4">
            <select
              value={format}
              onChange={(e) => setFormat(e.target.value)}
              className="border rounded px-3 py-2"
            >
              <option value="webp">WebP</option>
              <option value="avif">AVIF</option>
              <option value="jpeg">JPEG</option>
              <option value="png">PNG</option>
            </select>

            <div className="flex-1">
              <label className="text-sm font-medium">Quality: {quality}</label>
              <input
                type="range"
                min="1"
                max="100"
                value={quality}
                onChange={(e) => setQuality(Number(e.target.value))}
                className="w-full accent-blue-600"
              />
            </div>
          </div>

          <Button className="w-full" onClick={handleOptimize} disabled={!file}>
            Optimize
          </Button>
          {progress > 0 && <Progress value={progress} />}
        </CardContent>
      </Card>

      {/* Preview */}
      {originalUrl && (
        <div className="grid md:grid-cols-2 gap-8">
          <Card>
            <CardHeader>
              <CardTitle>Original</CardTitle>
            </CardHeader>
            <CardContent>
              <Image
                src={originalUrl}
                alt="original"
                width={400}
                height={300}
              />
              {stats && (
                <p className="text-sm mt-2">
                  {(stats.before / 1024).toFixed(1)} KB
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Optimized</CardTitle>
            </CardHeader>
            <CardContent>
              {optimizedUrl ? (
                <>
                  <Image
                    src={optimizedUrl}
                    alt="optimized"
                    width={400}
                    height={300}
                    className="rounded-lg"
                  />
                  {stats && (
                    <p className="text-sm mt-2 text-green-600">
                      {(stats.after / 1024).toFixed(1)} KB (saved{" "}
                      {(
                        ((stats.before - stats.after) / stats.before) *
                        100
                      ).toFixed(1)}
                      %)
                    </p>
                  )}
                  <a
                    href={optimizedUrl}
                    download={`optimized.${format}`}
                    className="inline-block mt-3 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    ⬇ Download
                  </a>
                </>
              ) : (
                <p className="text-gray-500">Processing...</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
