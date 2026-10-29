import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  // Preluăm cuvântul căutat din link (ex: ?q=lapte)
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query || query.length < 2) {
    return NextResponse.json(
      { error: "Termenul de căutare e prea scurt." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Neautorizat" }, { status: 401 });
  }
  let offResults: any[] = [];
  let usdaResults: any[] = [];
  try {
    // 1. Căutăm rapid în baza de date locală (dacă ai mai căutat sau salvat produsul în trecut)
    const { data: localFoods } = await supabase
      .from("foods")
      .select("*")
      .ilike("name", `%${query}%`)
      .limit(5);

    try {
      const offResponse = await fetch(
        `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&action=process&json=1&page_size=15`,
        {
          headers: {
            // Este FOARTE important să avem un User Agent ca să nu fim blocați de Cloudflare
            "User-Agent": "RepLogApp/1.0 - Android/Web",
            Accept: "application/json",
          },
        },
      );

      console.log("off response");
      console.log(offResponse.statusText);

      // Verificăm dacă răspunsul e cu adevărat OK și dacă e JSON
      const contentType = offResponse.headers.get("content-type");

      if (
        offResponse.ok &&
        contentType &&
        contentType.includes("application/json")
      ) {
        const offData = await offResponse.json();

        offResults = (offData.products || [])
          .map((p: any) => {
            const nutriments = p.nutriments || {};
            return {
              source: "open_food_facts",
              barcode: p.code,
              name: p.product_name_ro || p.product_name || "Produs Necunoscut",
              brand: p.brands || "Fără Brand",
              kcal_per_100g: nutriments["energy-kcal_100g"] || 0,
              protein_per_100g: nutriments["proteins_100g"] || 0,
              carbs_per_100g: nutriments["carbohydrates_100g"] || 0,
              fat_per_100g: nutriments["fat_100g"] || 0,
              fiber_per_100g: nutriments["fiber_100g"] || 0,
              image_url: p.image_front_small_url || null,
            };
          })
          .filter((p: any) => p.name !== "Produs Necunoscut");
      } else {
        console.warn(
          "Open Food Facts a returnat HTML sau o eroare:",
          offResponse.status,
        );

        //facem cu usda calls

        if (offResults.length === 0) {
          const apiKey = process.env.USDA_API_KEY;

          if (!apiKey) {
            console.warn("USDA_API_KEY nu este configurată.");
          } else {
            try {
              const params = new URLSearchParams({
                api_key: apiKey,
                query,
                pageSize: "15",
              });

              const usdaResponse = await fetch(
                `https://api.nal.usda.gov/fdc/v1/foods/search?${params.toString()}`,
                { headers: { Accept: "application/json" } },
              );

              if (!usdaResponse.ok) {
                throw new Error(`USDA HTTP ${usdaResponse.status}`);
              }

              const usdaData = await usdaResponse.json();

              usdaResults = (usdaData.foods || [])
                .filter((food: any) => food.fdcId && food.description)
                .map((food: any) => {
                  const nutrients = food.foodNutrients || [];

                  const getNutrient = (name: string) => {
                    const nutrient = nutrients.find(
                      (n: any) =>
                        n.nutrientName?.toLowerCase() === name.toLowerCase(),
                    );

                    const value = Number(nutrient?.value);
                    return Number.isFinite(value) && value >= 0 ? value : 0;
                  };

                  return {
                    source: "usda",
                    barcode: `USDA-${food.fdcId}`,
                    name: food.description.trim(),
                    brand: food.brandOwner || "USDA",
                    kcal_per_100g: getNutrient("Energy"),
                    protein_per_100g: getNutrient("Protein"),
                    carbs_per_100g: getNutrient("Carbohydrate, by difference"),
                    fat_per_100g: getNutrient("Total lipid (fat)"),
                    fiber_per_100g: getNutrient("Fiber, total dietary"),
                    image_url: null,
                  };
                });
            } catch (error) {
              console.warn("Căutarea USDA a eșuat:", error);
            }
          }
        }
      }
    } catch (offError) {
      console.warn("Eroare la apelarea Open Food Facts:", offError);
      // Nu dăm throw, lăsăm codul să continue cu datele locale
    }

    const combined = [
      ...(localFoods || []).map((f) => ({ ...f, source: "local_db" })),
      ...offResults,
      ...usdaResults,
    ];

    // Eliminăm duplicatele (în caz că un produs e deja salvat la tine, dar OFF îl returnează din nou)
    const uniqueResults = Array.from(
      new Map(combined.map((item) => [item.barcode, item])).values(),
    );

    return NextResponse.json({ results: uniqueResults });
  } catch (error) {
    console.error("API Search Error:", error);
    return NextResponse.json({ error: "Eroare internă" }, { status: 500 });
  }
}
