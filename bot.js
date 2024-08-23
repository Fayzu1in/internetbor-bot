const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");

// Replace with your Bot API token
const token = "7384364534:AAFGa_81kwYRHWRhBLF6EgkZjyaNeY4gek8";
// Replace with your Yandex Maps API key
const yandexApiKey = "ae67d8b1-fa31-44d0-94c2-6a583d082d64";
const apiEndpoint = "https://internetbor.uz/api/v1/bot-callback/";

// Create a bot that uses polling to fetch new updates
const bot = new TelegramBot(token, { polling: true });

// Object to track conversation state
const userState = {};
const userData = {};

// Handle the /start command
bot.onText(/\/start/, (msg) => {
  const chatId = msg.chat.id;

  // Ask the user to select a language
  bot.sendMessage(chatId, "Выберите язык:", {
    reply_markup: {
      inline_keyboard: [
        [{ text: "Русский 🇷🇺", callback_data: "language_russian" }],
        [{ text: "Узбекский 🇺🇿", callback_data: "language_uzbek" }],
      ],
    },
  });
});

// Handle language selection
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;

  if (data === "language_russian") {
    userState[chatId] = { language: "ru" };
    bot.sendMessage(
      chatId,
      "Привет! Хочешь провести домой интернет? Отправь нам свою геолокацию, чтобы мы знали, какие провайдеры есть на твоей улице.",
      {
        reply_markup: {
          keyboard: [
            [{ text: "Отправить геолокацию", request_location: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  } else if (data === "language_uzbek") {
    userState[chatId] = { language: "uz" };
    bot.sendMessage(
      chatId,
      "Salom! Internetni uyingizga o‘tkazmoqchimisiz? O‘zingizning geolokatsiyangizni yuboring, biz sizning ko‘chada qaysi provayderlar mavjudligini bilamiz.",
      {
        reply_markup: {
          keyboard: [
            [{ text: "Geolokatsiyani yuboring", request_location: true }],
          ],
          resize_keyboard: true,
          one_time_keyboard: true,
        },
      }
    );
  }

  // Answer the callback query
  bot.answerCallbackQuery(query.id);
});

// Handle incoming location data
bot.on("location", async (msg) => {
  const chatId = msg.chat.id;
  const { latitude, longitude } = msg.location;

  // Get user language
  const language = userState[chatId]?.language || "ru";

  try {
    // Reverse geocode the location using Yandex Maps API
    const response = await axios.get(`https://geocode-maps.yandex.ru/1.x/`, {
      params: {
        geocode: `${longitude},${latitude}`,
        format: "json",
        apikey: yandexApiKey,
      },
    });

    // Extract address from response
    const address =
      response.data.response.GeoObjectCollection.featureMember[0].GeoObject
        .name;

    // Store location data
    userData[chatId] = { ...userData[chatId], address };

    // Send a message to confirm address
    const confirmMessage =
      language === "ru"
        ? `Ваш адрес: ${address}. Вы подтверждаете этот адрес?`
        : `Manzil: ${address}. Siz bu manzilni tasdiqlaysizmi?`;

    bot.sendMessage(chatId, "Спасибо за отправленную геолокацию.", {
      reply_markup: {
        remove_keyboard: true, // Hide the previous keyboard
      },
    });

    bot.sendMessage(chatId, confirmMessage, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Да ✅", callback_data: "confirm_yes" }],
          [{ text: "Нет 🚫", callback_data: "confirm_no" }],
        ],
      },
    });
  } catch (error) {
    console.error("Error fetching address:", error);
    bot.sendMessage(
      chatId,
      language === "ru"
        ? "Произошла ошибка при получении адреса. Пожалуйста, попробуйте еще раз."
        : "Manzilni olishda xatolik yuz berdi. Iltimos, yana bir bor urinib ko'ring."
    );
  }
});

// Handle callback queries
bot.on("callback_query", async (query) => {
  const chatId = query.message.chat.id;
  const data = query.data;
  const language = userState[chatId]?.language || "ru";

  if (data === "confirm_yes") {
    // Prompt the user to either send their phone number via a button or enter it manually
    const promptMessage =
      language === "ru"
        ? "Пожалуйста, отправьте ваш номер телефона, либо введите его вручную."
        : "Iltimos, telefon raqamingizni yuboring yoki qo'lda kiriting.";

    bot.sendMessage(chatId, promptMessage, {
      reply_markup: {
        keyboard: [
          [
            {
              text:
                language === "ru"
                  ? "Отправить номер телефона"
                  : "Telefon raqamini yuboring",
              request_contact: true,
            },
          ],
        ],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    });

    // Update state to expect phone number input (either via button or manually)
    userState[chatId] = "awaiting_phone_number";
  } else if (data === "confirm_no") {
    // Prompt the user to write their location manually
    bot.sendMessage(
      chatId,
      language === "ru"
        ? "Напишите свою локацию вручную."
        : "Manzilni qo‘lda yozing."
    );
    userState[chatId] = "awaiting_manual_location"; // Track state
  } else if (data === "confirm_final") {
    const { name, phone_number, address } = userData[chatId];

    bot.sendMessage(
      chatId,
      language === "ru"
        ? "Спасибо за предоставленную информацию! Мы свяжемся с вами в ближайшее время."
        : "Ma'lumot uchun rahmat! Tez orada siz bilan bog'lanamiz."
    );
    try {
      const response = await axios.post(apiEndpoint, {
        name: name,
        phone: phone_number,
        address: address,
      });
      console.log("Response from server:", response.data);

      // Optionally, handle the response from the server
      if (response.status === 201) {
        bot.sendMessage(
          chatId,
          language === "ru"
            ? "Ваши данные успешно отправлены!"
            : "Ma'lumotlaringiz muvaffaqiyatli yuborildi!"
        );
      } else {
        bot.sendMessage(
          chatId,
          language === "ru"
            ? "Произошла ошибка при отправке данных."
            : "Ma'lumotlaringizni yuborishda xatolik yuz berdi."
        );
      }
    } catch (error) {
      console.error("Error sending data:", error);
      bot.sendMessage(
        chatId,
        language === "ru"
          ? "Произошла ошибка при отправке данных."
          : "Ma'lumotlaringizni yuborishda xatolik yuz berdi."
      );
    }

    // Optionally, you can remove the inline keyboard if needed
    bot.editMessageReplyMarkup(
      { inline_keyboard: [] },
      {
        chat_id: chatId,
        message_id: query.message.message_id,
      }
    );
  }

  // Answer the callback query
  bot.answerCallbackQuery(query.id);
});

// Handle incoming contact data (phone number)
bot.on("contact", (msg) => {
  const chatId = msg.chat.id;
  const { phone_number } = msg.contact;

  // Store phone number data
  userData[chatId] = { ...userData[chatId], phone_number };

  // Remove the keyboard and request the user's name
  bot.sendMessage(chatId, "Спасибо! Теперь напишите ваше имя.", {
    reply_markup: {
      remove_keyboard: true, // Hide the previous keyboard
    },
  });
  userState[chatId] = "awaiting_name"; // Track state
});

// Handle incoming text data (user name or manual phone number)
bot.on("text", (msg) => {
  const chatId = msg.chat.id;
  const state = userState[chatId];

  if (state === "awaiting_phone_number") {
    const phoneNumber = msg.text;

    // Store manually entered phone number
    userData[chatId] = { ...userData[chatId], phone_number: phoneNumber };

    // Prompt the user to enter their name
    bot.sendMessage(chatId, "Спасибо! Теперь напишите ваше имя.", {
      reply_markup: {
        remove_keyboard: true, // Hide the previous keyboard
      },
    });
    userState[chatId] = "awaiting_name"; // Track state
  } else if (state === "awaiting_name") {
    const name = msg.text;

    // Store the name
    userData[chatId] = { ...userData[chatId], name };

    // Ask the user to confirm their details
    const { address, phone_number } = userData[chatId];
    const language = userState[chatId]?.language || "ru";

    const confirmDetails =
      language === "ru"
        ? `Пожалуйста, подтвердите свои данные:\n\nИмя: ${name}\nТелефон: ${phone_number}\nАдрес: ${address}\n\nВсе верно?`
        : `Iltimos, ma'lumotlaringizni tasdiqlang:\n\nIsm: ${name}\nTelefon: ${phone_number}\nManzil: ${address}\n\nHammasi to‘g‘rimi?`;

    bot.sendMessage(chatId, confirmDetails, {
      reply_markup: {
        inline_keyboard: [
          [{ text: "Да ✅", callback_data: "confirm_final" }],
          [{ text: "Нет 🚫", callback_data: "confirm_no" }],
        ],
      },
    });
  } else if (state === "awaiting_manual_location") {
    const address = msg.text;

    // Store the manually entered address
    userData[chatId] = { ...userData[chatId], address };

    // Ask for phone number
    const language = userState[chatId]?.language || "ru";
    bot.sendMessage(
      chatId,
      language === "ru"
        ? "Пожалуйста, отправьте ваш номер телефона."
        : "Iltimos, telefon raqamingizni yuboring."
    );

    // Update state to expect phone number
    userState[chatId] = "awaiting_phone_number";
  }
});
