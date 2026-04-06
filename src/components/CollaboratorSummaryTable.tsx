import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Search, Download, ArrowUpDown, ArrowUp, ArrowDown, Gift, Cake, X } from "lucide-react";
import { format, differenceInDays, addYears, isBefore, isAfter, startOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { parseDateSafely, formatDateSafe } from "@/lib/dateUtils";

interface CollaboratorSummary {
  id: string;
  nome: string;
  email: string;
  cargo: string | null;
  sub_time: string | null;
  modelo_contrato: string | null;
  data_contrato: string | null;
  data_nascimento: string | null;
  dia_pagamento: number | null;
}

function getNextAnniversary(dateStr: string | null): Date | null {
  if (!dateStr) return null;
  const date = parseDateSafely(dateStr);
  const today = startOfDay(new Date());
  const thisYear = today.getFullYear();
  
  let anniversary = new Date(thisYear, date.getMonth(), date.getDate());
  if (isBefore(anniversary, today)) {
    anniversary = new Date(thisYear + 1, date.getMonth(), date.getDate());
  }
  return anniversary;
}

function isWithin30Days(date: Date | null): boolean {
  if (!date) return false;
  const today = startOfDay(new Date());
  const diff = differenceInDays(date, today);
  return diff >= 0 && diff <= 30;
}

const CONTRACT_LABELS: Record<string, string> = {
  CLT: "CLT",
  CLT_ABONO_LIVRE: "CLT Abono Livre",
  CLT_ABONO_FIXO: "CLT Abono Fixo",
  PJ: "PJ",
};

export function CollaboratorSummaryTable() {
  const [data, setData] = useState<CollaboratorSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterTime, setFilterTime] = useState<string>("all");
  const [filterContract, setFilterContract] = useState<string>("all");
  const [filterPayment, setFilterPayment] = useState<string>("all");
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    const { data: people, error } = await supabase
      .from("people")
      .select("id, nome, email, cargo, sub_time, modelo_contrato, data_contrato, data_nascimento, dia_pagamento")
      .eq("ativo", true)
      .order("nome");

    if (!error && people) {
      setData(people as CollaboratorSummary[]);
    }
    setLoading(false);
  };

  const availableTimes = useMemo(() => {
    const times = new Set(data.map(p => p.sub_time).filter(Boolean) as string[]);
    return Array.from(times).sort();
  }, [data]);

  const handleSort = (col: string) => {
    if (sortColumn === col) {
      if (sortDirection === "asc") setSortDirection("desc");
      else { setSortColumn(null); setSortDirection("asc"); }
    } else {
      setSortColumn(col);
      setSortDirection("asc");
    }
  };

  const SortIcon = ({ col }: { col: string }) => {
    if (sortColumn !== col) return <ArrowUpDown className="h-3 w-3 opacity-50" />;
    return sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />;
  };

  const filtered = useMemo(() => {
    let result = data.filter(p => {
      const matchSearch = !searchTerm ||
        p.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.cargo && p.cargo.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (p.sub_time && p.sub_time.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchTime = filterTime === "all" || p.sub_time === filterTime;
      const matchContract = filterContract === "all" || p.modelo_contrato === filterContract;
      const matchPayment = filterPayment === "all" ||
        (filterPayment === "none" ? !p.dia_pagamento : p.dia_pagamento?.toString() === filterPayment);
      return matchSearch && matchTime && matchContract && matchPayment;
    });

    if (sortColumn) {
      result = [...result].sort((a, b) => {
        let aVal: any, bVal: any;
        switch (sortColumn) {
          case "nome": aVal = a.nome.toLowerCase(); bVal = b.nome.toLowerCase(); break;
          case "modelo_contrato": aVal = a.modelo_contrato || ""; bVal = b.modelo_contrato || ""; break;
          case "data_contrato":
            aVal = a.data_contrato ? parseDateSafely(a.data_contrato).getTime() : 0;
            bVal = b.data_contrato ? parseDateSafely(b.data_contrato).getTime() : 0;
            break;
          case "aniv_contrato":
            aVal = getNextAnniversary(a.data_contrato)?.getTime() || Infinity;
            bVal = getNextAnniversary(b.data_contrato)?.getTime() || Infinity;
            break;
          case "data_nascimento":
            aVal = a.data_nascimento ? parseDateSafely(a.data_nascimento).getTime() : 0;
            bVal = b.data_nascimento ? parseDateSafely(b.data_nascimento).getTime() : 0;
            break;
          case "aniv_pessoal":
            aVal = getNextAnniversary(a.data_nascimento)?.getTime() || Infinity;
            bVal = getNextAnniversary(b.data_nascimento)?.getTime() || Infinity;
            break;
          case "dia_pagamento":
            aVal = a.dia_pagamento || 0;
            bVal = b.dia_pagamento || 0;
            break;
          default: return 0;
        }
        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [data, searchTerm, filterTime, filterContract, filterPayment, sortColumn, sortDirection]);

  const exportCSV = () => {
    const headers = ["Nome", "Modelo Contrato", "Data Contrato", "Aniversário Contrato", "Data Nascimento", "Próximo Aniversário", "Dia Pagamento", "Time"];
    const rows = filtered.map(p => {
      const anivContrato = getNextAnniversary(p.data_contrato);
      const anivPessoal = getNextAnniversary(p.data_nascimento);
      return [
        p.nome,
        CONTRACT_LABELS[p.modelo_contrato || "CLT"] || p.modelo_contrato || "-",
        p.data_contrato ? formatDateSafe(p.data_contrato, "dd/MM/yyyy") : "-",
        anivContrato ? format(anivContrato, "dd/MM/yyyy") : "-",
        p.data_nascimento ? formatDateSafe(p.data_nascimento, "dd/MM/yyyy") : "-",
        anivPessoal ? format(anivPessoal, "dd/MM/yyyy") : "-",
        p.modelo_contrato === "PJ" && p.dia_pagamento ? `Dia ${p.dia_pagamento}` : "-",
        p.sub_time || "-",
      ].join(",");
    });
    const csv = [headers.join(","), ...rows].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumo-colaboradores-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const hasActiveFilters = filterTime !== "all" || filterContract !== "all" || filterPayment !== "all";

  return (
    <Card>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <CardTitle>Resumo do Colaborador</CardTitle>
        <Button variant="outline" size="sm" onClick={exportCSV}>
          <Download className="h-4 w-4 mr-2" />
          Exportar CSV
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, cargo ou time..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={filterTime} onValueChange={setFilterTime}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Times</SelectItem>
              {availableTimes.map(t => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={filterContract} onValueChange={setFilterContract}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Contrato" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os Contratos</SelectItem>
              <SelectItem value="CLT">CLT</SelectItem>
              <SelectItem value="CLT_ABONO_LIVRE">CLT Abono Livre</SelectItem>
              <SelectItem value="CLT_ABONO_FIXO">CLT Abono Fixo</SelectItem>
              <SelectItem value="PJ">PJ</SelectItem>
            </SelectContent>
          </Select>
          <Select value={filterPayment} onValueChange={setFilterPayment}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Dia Pgto" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="10">Dia 10</SelectItem>
              <SelectItem value="20">Dia 20</SelectItem>
              <SelectItem value="30">Dia 30</SelectItem>
            </SelectContent>
          </Select>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={() => { setFilterTime("all"); setFilterContract("all"); setFilterPayment("all"); }}>
              <X className="h-4 w-4 mr-1" /> Limpar
            </Button>
          )}
        </div>

        <div className="text-sm text-muted-foreground">
          {filtered.length} colaborador{filtered.length !== 1 ? "es" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
        </div>

        {/* Table */}
        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">Carregando...</div>
        ) : (
          <div className="relative overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  {[
                    { key: "nome", label: "Nome" },
                    { key: "modelo_contrato", label: "Modelo Contrato" },
                    { key: "data_contrato", label: "Data Contrato" },
                    { key: "aniv_contrato", label: "Aniv. Contrato" },
                    { key: "data_nascimento", label: "Nascimento" },
                    { key: "aniv_pessoal", label: "Próx. Aniversário" },
                    { key: "dia_pagamento", label: "Dia Pgto" },
                  ].map(col => (
                    <TableHead key={col.key}>
                      <Button
                        variant="ghost"
                        onClick={() => handleSort(col.key)}
                        className="h-auto p-0 hover:bg-transparent font-semibold flex items-center gap-1"
                      >
                        {col.label}
                        <SortIcon col={col.key} />
                      </Button>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      Nenhum colaborador encontrado
                    </TableCell>
                  </TableRow>
                ) : (
                  filtered.map(person => {
                    const anivContrato = getNextAnniversary(person.data_contrato);
                    const anivPessoal = getNextAnniversary(person.data_nascimento);
                    const contractSoon = isWithin30Days(anivContrato);
                    const birthdaySoon = isWithin30Days(anivPessoal);

                    return (
                      <TableRow key={person.id} className={birthdaySoon || contractSoon ? "bg-accent/30" : ""}>
                        <TableCell className="font-medium">
                          <div>
                            {person.nome}
                            {birthdaySoon && <Cake className="inline ml-1 h-4 w-4 text-pink-500" />}
                          </div>
                          {person.cargo && (
                            <span className="text-xs text-muted-foreground">{person.cargo}</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {CONTRACT_LABELS[person.modelo_contrato || "CLT"] || person.modelo_contrato || "CLT"}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {person.data_contrato
                            ? formatDateSafe(person.data_contrato, "dd/MM/yyyy")
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {anivContrato ? (
                            <span className={contractSoon ? "font-semibold text-primary" : ""}>
                              {format(anivContrato, "dd/MM/yyyy")}
                              {contractSoon && <Gift className="inline ml-1 h-4 w-4" />}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {person.data_nascimento
                            ? format(new Date(person.data_nascimento), "dd/MM/yyyy")
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {anivPessoal ? (
                            <span className={birthdaySoon ? "font-semibold text-pink-600" : ""}>
                              {format(anivPessoal, "dd/MM/yyyy")}
                              {birthdaySoon && <Cake className="inline ml-1 h-4 w-4" />}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {person.modelo_contrato === "PJ" && person.dia_pagamento ? (
                            <Badge variant="secondary">Dia {person.dia_pagamento}</Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
