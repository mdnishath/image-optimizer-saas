"use client";

import { useEffect } from "react";

declare global {
  interface Window {
    FS: any;
  }
}

interface BuyCreditsButtonProps {
  planId: string;
  userEmail: string;
  onPurchaseSuccess?: () => void; // 👈 notify parent
}

export default function BuyCreditsButton({
  planId,
  userEmail,
  onPurchaseSuccess,
}: BuyCreditsButtonProps) {
  useEffect(() => {
    const script = document.createElement("script");
    script.src = "https://checkout.freemius.com/js/v1/";
    script.async = true;
    document.body.appendChild(script);

    return () => {
      document.body.removeChild(script);
    };
  }, []);

  const handleBuy = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();

    const handler = new window.FS.Checkout({
      product_id: Number(process.env.NEXT_PUBLIC_FREEMIUS_PRODUCT_ID),
      plan_id: planId,
      public_key: process.env.NEXT_PUBLIC_FREEMIUS_PUBLIC_KEY,
    });

    handler.open({
      user_email: userEmail,
      readonly_user: true,
      success: async (response: any) => {
        await fetch("/api/freemius/success", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...response,
            plan_id: planId,
          }),
        });

        // 👇 tell dashboard to refresh credits
        if (onPurchaseSuccess) {
          onPurchaseSuccess();
        }
      },
    });
  };

  return (
    <button
      onClick={handleBuy}
      className="rounded-lg bg-orange-600 px-5 py-3 text-white hover:bg-orange-700"
    >
      Buy Now
    </button>
  );
}
