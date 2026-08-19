"use server";

import { createClient } from "@/lib/supabase/server";

export async function criarCliente(formData: FormData): Promise<void> {
  const supabase = await createClient();

  const nome = String(formData.get("nome") ?? "").trim();
  const nif = String(formData.get("nif") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const telefone = String(formData.get("telefone") ?? "").trim();
  const morada = String(formData.get("morada") ?? "").trim();

  if (!nome || !nif || !email || !telefone || !morada) {
    throw new Error("Todos os campos obrigatórios devem ser preenchidos.");
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .insert({ email })
    .select("id")
    .single();

  if (userError) {
    throw new Error(userError.message);
  }

  const { data: address, error: addressError } = await supabase
    .from("addresses")
    .insert({
      street: morada,
      number: "s/n",
      postal_code: "0000-000",
      city: "Não especificada",
      district: "Não especificado",
      country: "Portugal",
    })
    .select("id")
    .single();

  if (addressError) {
    throw new Error(addressError.message);
  }

  const { error: profileError } = await supabase
    .from("profiles")
    .insert({
      user_id: user.id,
      name: nome,
      phone: telefone,
      address_id: address.id,
      tax_number: nif,
    });

  if (profileError) {
    throw new Error(profileError.message);
  }

  const { error: registrationError } = await supabase
    .from("registrations")
    .insert({
      user_id: user.id,
      type: "CUSTOMER",
      status: "DRAFT",
    });

  if (registrationError) {
    throw new Error(registrationError.message);
  }
}
