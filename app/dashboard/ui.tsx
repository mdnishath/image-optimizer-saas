"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import Image from "next/image";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

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

  const accessToken =
    typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;

  // ✅ Load credits
  useEffect(() => {
    if (!accessToken) {
      router.push("/login");
      return;
    }
    fetch("/api/user/credits", {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((data) => setCredits(data.credits));
  }, [router, accessToken]);

  // ✅ Optimize handler
  const handleOptimize = async () => {
    if (!file || !accessToken) return;

    setOriginalUrl(URL.createObjectURL(file));
    setOptimizedUrl(null);
    setStats(null);
    setProgress(20);

    let res;
    if (file.size < 4 * 1024 * 1024) {
      // Small file → send binary directly
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
      // Big file → upload to Supabase first
      const { data, error } = await supabase.storage
        .from("temp-uploads")
        .upload(`raw/${Date.now()}-${file.name}`, file, { upsert: false });

      if (error) {
        alert("Upload error: " + error.message);
        return;
      }

      res = await fetch("/api/images/optimize", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "x-format": format,
          "x-quality": quality.toString(),
        },
        body: JSON.stringify({ path: data.path }),
      });
    }

    setProgress(60);

    if (res.ok) {
      const data = await res.json();

      // ✅ Handle either base64 (small) or Supabase URL (big)
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
            router.push("/login");
          }}
        >
          Logout
        </Button>
      </div>

      {/* Credits */}
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
                className="rounded-lg"
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
                  <img
                    src={optimizedUrl}
                    alt="optimized"
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

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Optimizations</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border">
                <thead>
                  <tr className="bg-gray-50 border-b">
                    <th className="p-3">Format</th>
                    <th className="p-3">Before</th>
                    <th className="p-3">After</th>
                    <th className="p-3">Saved</th>
                    <th className="p-3">Date</th>
                    <th className="p-3 text-center">Download</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((log) => {
                    const saved = (
                      ((log.sizeBefore - log.sizeAfter) / log.sizeBefore) *
                      100
                    ).toFixed(1);
                    return (
                      <tr key={log.id} className="border-b">
                        <td className="p-3">{log.format.toUpperCase()}</td>
                        <td className="p-3">
                          {(log.sizeBefore / 1024).toFixed(1)} KB
                        </td>
                        <td className="p-3">
                          {(log.sizeAfter / 1024).toFixed(1)} KB
                        </td>
                        <td className="p-3 text-green-600">{saved}%</td>
                        <td className="p-3">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="p-3 text-center">
                          <a
                            href={log.fileUrl}
                            download={`optimized-${log.id}.${log.format}`}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700"
                          >
                            ⬇
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-gray-500">No history yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
