import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";
import { MONTH_NAMES } from "@/lib/dateUtils";

export type EnhancedCalendarProps = React.ComponentProps<typeof DayPicker> & {
  enableYearNavigation?: boolean;
};

function EnhancedCalendar({ 
  className, 
  classNames, 
  showOutsideDays = true,
  enableYearNavigation = true,
  ...props 
}: EnhancedCalendarProps) {
  const [month, setMonth] = React.useState<Date>(props.month || new Date());
  const [yearInput, setYearInput] = React.useState<string>(month.getFullYear().toString());

  React.useEffect(() => {
    if (props.month) {
      setMonth(props.month);
      setYearInput(props.month.getFullYear().toString());
    }
  }, [props.month]);

  const handleMonthChange = (newMonth: Date) => {
    setMonth(newMonth);
    setYearInput(newMonth.getFullYear().toString());
    props.onMonthChange?.(newMonth);
  };

  const handleMonthSelect = (monthIndex: string) => {
    const newMonth = new Date(month.getFullYear(), parseInt(monthIndex), 1);
    handleMonthChange(newMonth);
  };

  const handleYearChange = (value: string) => {
    setYearInput(value);
    const year = parseInt(value);
    if (year >= 1930 && year <= new Date().getFullYear()) {
      const newMonth = new Date(year, month.getMonth(), 1);
      handleMonthChange(newMonth);
    }
  };

  const handleYearNavigation = (increment: number) => {
    const newYear = month.getFullYear() + increment;
    if (newYear >= 1930 && newYear <= new Date().getFullYear()) {
      const newMonth = new Date(newYear, month.getMonth(), 1);
      handleMonthChange(newMonth);
    }
  };

  const CustomCaption = () => (
    <div className="flex justify-center items-center gap-2 py-2">
      {enableYearNavigation && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleYearNavigation(-10)}
          disabled={month.getFullYear() <= 1940}
          className="h-7 w-7 p-0"
        >
          <ChevronLeft className="h-3 w-3" />
          <ChevronLeft className="h-3 w-3 -ml-1" />
        </Button>
      )}
      
      <Select value={month.getMonth().toString()} onValueChange={handleMonthSelect}>
        <SelectTrigger className="w-32 h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTH_NAMES.map((name, index) => (
            <SelectItem key={index} value={index.toString()}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="number"
        min={1930}
        max={new Date().getFullYear()}
        value={yearInput}
        onChange={(e) => handleYearChange(e.target.value)}
        className="w-20 h-8 text-center"
      />

      {enableYearNavigation && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleYearNavigation(10)}
          disabled={month.getFullYear() >= new Date().getFullYear() - 10}
          className="h-7 w-7 p-0"
        >
          <ChevronRight className="h-3 w-3" />
          <ChevronRight className="h-3 w-3 -ml-1" />
        </Button>
      )}
    </div>
  );

  return (
    <div className="p-3">
      <CustomCaption />
      <DayPicker
        month={month}
        onMonthChange={handleMonthChange}
        showOutsideDays={showOutsideDays}
        className={cn("pt-1", className)}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "hidden", // Hide default caption since we have custom one
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse space-y-1",
          head_row: "flex",
          head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem]",
          row: "flex w-full mt-2",
          cell: "h-9 w-9 text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20",
          day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
          day_range_end: "day-range-end",
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground",
          day_outside:
            "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          day_disabled: "text-muted-foreground opacity-50",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: ({ ..._props }) => <ChevronLeft className="h-4 w-4" />,
          IconRight: ({ ..._props }) => <ChevronRight className="h-4 w-4" />,
        }}
        {...props}
      />
    </div>
  );
}

EnhancedCalendar.displayName = "EnhancedCalendar";

export { EnhancedCalendar };