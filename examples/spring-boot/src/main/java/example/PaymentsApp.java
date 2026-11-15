package example;

import java.util.List;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** Run it, then open http://localhost:8080/specdiff */
@SpringBootApplication
public class PaymentsApp {
  public static void main(String[] args) { SpringApplication.run(PaymentsApp.class, args); }

  public record PaymentInput(long amount, String currency) {}
  public record Payment(String id, long amount, String currency, String status) {}

  @RestController
  @RequestMapping("/v1/payments")
  static class Payments {
    @GetMapping public List<Payment> list() { return List.of(new Payment("pay_1", 1200, "AED", "paid")); }
    @PostMapping public Payment create(@RequestBody PaymentInput in) { return new Payment("pay_2", in.amount(), in.currency(), "pending"); }
  }
}
